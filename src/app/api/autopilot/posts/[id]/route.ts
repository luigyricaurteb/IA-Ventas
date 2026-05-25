export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }
const BASE = "https://graph.facebook.com/v21.0";

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  const { id } = await params;

  const body = await req.json() as Record<string, unknown>;
  const allowed = ["caption","hashtags","platform","status","image_id","scheduled_at"];
  const fields = Object.keys(body).filter(k => allowed.includes(k));
  if (!fields.length) return NextResponse.json({ ok: true });

  const sets = fields.map(f => `${f}=?`).join(", ");
  db.prepare(`UPDATE autopilot_posts SET ${sets} WHERE id=?`).run(...fields.map(f => body[f]), Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  const { id } = await params;
  db.prepare("DELETE FROM autopilot_posts WHERE id=?").run(Number(id));
  return NextResponse.json({ ok: true });
}

// POST = publish this post to Facebook/Instagram
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  const { id } = await params;

  const post = db.prepare(`
    SELECT p.*, i.filename as image_filename
    FROM autopilot_posts p LEFT JOIN autopilot_images i ON p.image_id=i.id
    WHERE p.id=?
  `).get(Number(id)) as {
    id: number; caption: string; hashtags: string | null; platform: string;
    image_filename: string | null; status: string;
  } | null;

  if (!post) return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
  if (post.status === "published") return NextResponse.json({ error: "Ya fue publicado" }, { status: 400 });

  const waCfg = db.prepare("SELECT fb_page_id, fb_page_token, ig_account_id FROM whatsapp_config WHERE id=1").get() as {
    fb_page_id: string | null; fb_page_token: string | null; ig_account_id: string | null;
  } | null;

  const message = [post.caption, post.hashtags].filter(Boolean).join("\n\n");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    ?? `https://aivoxgroup.com`;
  const imageUrl = post.image_filename ? `${appUrl}/api/uploads/autopilot/${post.image_filename}` : null;

  let fbPostId: string | null = null;
  let igPostId: string | null = null;
  const errors: string[] = [];

  // ── Facebook ──────────────────────────────────────────────────────────────
  if ((post.platform === "both" || post.platform === "facebook") && waCfg?.fb_page_id && waCfg?.fb_page_token) {
    try {
      const endpoint = imageUrl
        ? `${BASE}/${waCfg.fb_page_id}/photos`
        : `${BASE}/${waCfg.fb_page_id}/feed`;

      const fbBody = imageUrl
        ? { url: imageUrl, message, access_token: waCfg.fb_page_token }
        : { message, access_token: waCfg.fb_page_token };

      const fbRes = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fbBody),
        signal: AbortSignal.timeout(30000),
      });
      const fbData = await fbRes.json() as { id?: string; error?: { message: string } };
      if (fbData.id) fbPostId = fbData.id;
      else errors.push(`FB: ${fbData.error?.message ?? "Error desconocido"}`);
    } catch (e) { errors.push(`FB: ${(e as Error).message}`); }
  }

  // ── Instagram ─────────────────────────────────────────────────────────────
  if ((post.platform === "both" || post.platform === "instagram") && waCfg?.ig_account_id && waCfg?.fb_page_token && imageUrl) {
    try {
      // Step 1: Create media container
      const containerRes = await fetch(`${BASE}/${waCfg.ig_account_id}/media`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, caption: message, access_token: waCfg.fb_page_token }),
        signal: AbortSignal.timeout(30000),
      });
      const container = await containerRes.json() as { id?: string; error?: { message: string } };

      if (container.id) {
        // Wait a moment for Meta to process
        await new Promise(r => setTimeout(r, 3000));

        // Step 2: Publish
        const publishRes = await fetch(`${BASE}/${waCfg.ig_account_id}/media_publish`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: container.id, access_token: waCfg.fb_page_token }),
          signal: AbortSignal.timeout(30000),
        });
        const published = await publishRes.json() as { id?: string; error?: { message: string } };
        if (published.id) igPostId = published.id;
        else errors.push(`IG: ${published.error?.message ?? "Error al publicar"}`);
      } else {
        errors.push(`IG: ${container.error?.message ?? "Error al crear contenido"}`);
      }
    } catch (e) { errors.push(`IG: ${(e as Error).message}`); }
  }

  const success = !!(fbPostId || igPostId);
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    UPDATE autopilot_posts SET
      status=?, published_at=?, fb_post_id=?, ig_post_id=?, error_msg=?
    WHERE id=?
  `).run(
    success ? "published" : "failed",
    success ? now : null,
    fbPostId, igPostId,
    errors.length ? errors.join(" | ") : null,
    Number(id)
  );

  if (success) return NextResponse.json({ ok: true, fbPostId, igPostId });
  return NextResponse.json({ ok: false, errors }, { status: 422 });
}
