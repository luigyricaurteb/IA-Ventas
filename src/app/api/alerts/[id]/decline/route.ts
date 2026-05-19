export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const proofId = Number(id);
  let body: { reason?: string } = {};
  try { body = await req.json() as typeof body; } catch {}

  const proof = db.prepare("SELECT * FROM payment_proofs WHERE id=?").get(proofId) as {
    id: number; conversation_id: number; reviewed: number;
  } | null;

  if (!proof) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });
  if (proof.reviewed) return NextResponse.json({ error: "Ya fue revisado" }, { status: 400 });

  // Mark as declined (-1)
  db.prepare("UPDATE payment_proofs SET reviewed=-1, reviewed_at=unixepoch() WHERE id=?").run(proofId);

  const conversation = db.prepare("SELECT id, phone FROM conversations WHERE id=?").get(proof.conversation_id) as { id: number; phone: string } | null;

  if (conversation) {
    const reason = body.reason?.trim();
    const msg = reason
      ? `⚠️ Tu comprobante de pago no pudo ser verificado.\n\n_Motivo: ${reason}_\n\nPor favor verifica el pago e intenta nuevamente enviando el comprobante correcto, o comunícate con nosotros. 🙏`
      : `⚠️ No pudimos verificar tu comprobante de pago. Por favor revisa que el monto y los datos sean correctos, y envíanos el comprobante nuevamente.\n\nSi crees que hay un error, no dudes en contactarnos. 🙏`;

    db.prepare("INSERT INTO outbox (conversation_id, phone, content) VALUES (?,?,?)").run(conversation.id, conversation.phone, msg);
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conversation.id, "assistant", msg);

    // Reset bot state to ACTIVE so client can try again
    db.prepare("UPDATE bot_conversation_state SET state='AWAITING_PAYMENT', updated_at=unixepoch() WHERE conversation_id=?").run(conversation.id);
  }

  return NextResponse.json({ ok: true });
}
