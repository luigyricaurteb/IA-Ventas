import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx {
  params: Promise<{ conversationId: string }>;
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

  const conv = db.prepare("SELECT id FROM conversations WHERE id = ?").get(id);
  if (!conv) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const mode = body.mode;

  if (mode !== "AI" && mode !== "HUMAN") {
    return NextResponse.json({ error: "Modo inválido. Usa 'AI' o 'HUMAN'" }, { status: 400 });
  }

  db.prepare("UPDATE conversations SET mode = ? WHERE id = ?").run(mode, id);
  return NextResponse.json({ ok: true, mode });
}
