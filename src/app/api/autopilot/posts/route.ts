export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const where = status ? "WHERE p.status=?" : "";
  const args = status ? [status] : [];

  const posts = db.prepare(`
    SELECT p.*, i.filename as image_filename, i.original_name as image_name
    FROM autopilot_posts p
    LEFT JOIN autopilot_images i ON p.image_id = i.id
    ${where}
    ORDER BY p.created_at DESC LIMIT 50
  `).all(...args);

  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as { image_id?: number; caption: string; hashtags?: string; platform?: string; scheduled_at?: number };
  if (!body.caption) return NextResponse.json({ error: "Caption requerido" }, { status: 400 });

  const post = db.prepare(`
    INSERT INTO autopilot_posts (image_id, caption, hashtags, platform, scheduled_at)
    VALUES (?,?,?,?,?) RETURNING *
  `).get(body.image_id ?? null, body.caption, body.hashtags ?? "", body.platform ?? "both", body.scheduled_at ?? null);

  return NextResponse.json({ post }, { status: 201 });
}
