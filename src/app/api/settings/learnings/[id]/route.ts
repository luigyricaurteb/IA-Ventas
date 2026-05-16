export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  const { id } = await params;
  const body = await req.json() as { topic?: string; content?: string };
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.topic)   { fields.push("topic=?");   values.push(body.topic.trim()); }
  if (body.content) { fields.push("content=?"); values.push(body.content.trim()); }
  if (!fields.length) return NextResponse.json({ ok: true });
  values.push(Number(id));
  db.prepare(`UPDATE ai_learnings SET ${fields.join(",")} WHERE id=?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  const { id } = await params;
  db.prepare("DELETE FROM ai_learnings WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
