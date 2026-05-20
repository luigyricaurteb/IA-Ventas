export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

const BASE = "https://graph.facebook.com/v21.0";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const waCfg = db.prepare("SELECT fb_page_token FROM whatsapp_config WHERE id=1").get() as { fb_page_token: string | null } | null;
  if (!waCfg?.fb_page_token) return NextResponse.json({ error: "Meta no configurado" }, { status: 400 });

  const posts = db.prepare("SELECT id, fb_post_id, ig_post_id FROM autopilot_posts WHERE status='published' AND (fb_post_id IS NOT NULL OR ig_post_id IS NOT NULL)").all() as { id: number; fb_post_id: string | null; ig_post_id: string | null }[];

  let updated = 0;
  for (const post of posts) {
    try {
      let fbLikes = 0, igLikes = 0;

      if (post.fb_post_id) {
        const r = await fetch(`${BASE}/${post.fb_post_id}?fields=likes.summary(true),shares&access_token=${waCfg.fb_page_token}`, { signal: AbortSignal.timeout(10000) });
        if (r.ok) {
          const d = await r.json() as { likes?: { summary?: { total_count: number } }; shares?: { count: number } };
          fbLikes = d.likes?.summary?.total_count ?? 0;
        }
      }
      if (post.ig_post_id) {
        const r = await fetch(`${BASE}/${post.ig_post_id}?fields=like_count,comments_count&access_token=${waCfg.fb_page_token}`, { signal: AbortSignal.timeout(10000) });
        if (r.ok) {
          const d = await r.json() as { like_count?: number };
          igLikes = d.like_count ?? 0;
        }
      }

      db.prepare("UPDATE autopilot_posts SET fb_likes=?, ig_likes=? WHERE id=?").run(fbLikes, igLikes, post.id);
      updated++;
    } catch {}
  }

  return NextResponse.json({ ok: true, updated });
}
