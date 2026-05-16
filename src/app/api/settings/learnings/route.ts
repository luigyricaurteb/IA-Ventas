import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const learnings = db.prepare(
    "SELECT * FROM ai_learnings ORDER BY created_at DESC"
  ).all();

  return NextResponse.json({ learnings });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.topic || !body.content) {
    return NextResponse.json({ error: "Tema y contenido requeridos" }, { status: 400 });
  }

  const learning = db.prepare(
    "INSERT INTO ai_learnings (topic, content) VALUES (?, ?) RETURNING *"
  ).get(body.topic.trim(), body.content.trim());

  return NextResponse.json({ learning }, { status: 201 });
}
