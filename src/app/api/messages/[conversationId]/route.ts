import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { conversationId } = await params;
  const id = Number(conversationId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = db.prepare("SELECT id FROM conversations WHERE id = ?").get(id);
  if (!conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const messages = db.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 100"
  ).all(id);

  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { conversationId } = await params;
  const id = Number(conversationId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = db.prepare("SELECT id, phone FROM conversations WHERE id = ?").get(id) as {
    id: number; phone: string;
  } | null;
  if (!conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });
  }

  const message = db.prepare(
    "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'human', ?) RETURNING *"
  ).get(id, content);

  db.prepare(
    "INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)"
  ).run(id, conv.phone, content);

  return NextResponse.json({ ok: true, messageId: (message as { id: number }).id });
}
