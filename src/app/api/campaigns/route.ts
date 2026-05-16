import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const campaigns = db.prepare(
    "SELECT * FROM campaigns ORDER BY created_at DESC"
  ).all();

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.name || !body.subject || !body.body_html) {
    return NextResponse.json({ error: "Nombre, asunto y cuerpo requeridos" }, { status: 400 });
  }

  const campaign = db.prepare(`
    INSERT INTO campaigns (name, subject, body_html, target_stage, status)
    VALUES (?, ?, ?, ?, 'draft')
    RETURNING *
  `).get(
    body.name,
    body.subject,
    body.body_html,
    body.target_stage ?? null,
  );

  return NextResponse.json({ campaign }, { status: 201 });
}
