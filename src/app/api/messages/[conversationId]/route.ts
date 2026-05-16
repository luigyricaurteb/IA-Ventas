import { NextRequest, NextResponse } from "next/server";
import {
  getMessages,
  getConversationById,
  insertMessage,
  enqueueOutbox,
} from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = Number(conversationId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const messages = getMessages(id, 100);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = Number(conversationId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const conv = getConversationById(id);
  if (!conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });
  }

  const message = insertMessage(id, "human", content);
  enqueueOutbox(id, conv.phone, content);

  return NextResponse.json({ ok: true, messageId: message.id });
}
