export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ conversationId: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  const { conversationId } = await params;
  const id = Number(conversationId);

  // Eliminar estado del bot para que la próxima interacción arranque de cero
  db.prepare("DELETE FROM bot_conversation_state WHERE conversation_id=?").run(id);
  // Volver a modo AI
  db.prepare("UPDATE conversations SET mode='AI' WHERE id=?").run(id);
  // Agregar nota interna visible al equipo
  db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)")
    .run(id, "note", "🔄 Conversación reiniciada — el bot iniciará un nuevo flujo en el próximo mensaje.");

  return NextResponse.json({ ok: true });
}
