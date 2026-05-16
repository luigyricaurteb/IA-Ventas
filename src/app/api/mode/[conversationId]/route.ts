import { NextRequest, NextResponse } from "next/server";
import { getConversationById, setMode } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
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
  const mode = body.mode;

  if (mode !== "AI" && mode !== "HUMAN") {
    return NextResponse.json({ error: "Modo inválido. Usa 'AI' o 'HUMAN'" }, { status: 400 });
  }

  setMode(id, mode);
  return NextResponse.json({ ok: true, mode });
}
