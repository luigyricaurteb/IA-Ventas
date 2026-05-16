import { NextRequest, NextResponse } from "next/server";
import { resolveJulietaAlert, enqueueOutbox } from "@/lib/db";
import db from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const alertId = Number(id);
  const body = await req.json();

  if (!body.answer) return NextResponse.json({ error: "Respuesta requerida" }, { status: 400 });

  resolveJulietaAlert(alertId, body.answer, body.saveAsLearning ?? false, body.topic);

  // Si se pide, enviar la respuesta al cliente por WhatsApp
  if (body.sendToClient) {
    const alert = db.prepare<[number], { conversation_id: number }>(
      "SELECT conversation_id FROM julieta_alerts WHERE id = ?"
    ).get(alertId);
    if (alert) {
      const conv = db.prepare<[number], { id: number; phone: string }>(
        "SELECT id, phone FROM conversations WHERE id = ?"
      ).get(alert.conversation_id);
      if (conv) {
        enqueueOutbox(conv.id, conv.phone, body.answer);
        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'human', ?)").run(conv.id, body.answer);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
