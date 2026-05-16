import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const alertId = Number(id);
  const body = await req.json();

  if (!body.answer) return NextResponse.json({ error: "Respuesta requerida" }, { status: 400 });

  const saveAsLearning = body.saveAsLearning ?? false;

  // Resolver la alerta
  db.prepare(
    "UPDATE julieta_alerts SET human_answer = ?, resolved = 1, saved_as_learning = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(body.answer, saveAsLearning ? 1 : 0, alertId);

  // Guardar como aprendizaje si se solicita
  if (saveAsLearning && body.topic) {
    const alert = db.prepare<[number], { question: string }>(
      "SELECT question FROM julieta_alerts WHERE id = ?"
    ).get(alertId);

    db.prepare(
      "INSERT INTO ai_learnings (topic, content) VALUES (?, ?)"
    ).run(
      body.topic,
      `P: ${alert?.question ?? ""}\nR: ${body.answer}`,
    );
  }

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
        db.prepare(
          "INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)"
        ).run(conv.id, conv.phone, body.answer);
        db.prepare(
          "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'human', ?)"
        ).run(conv.id, body.answer);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
