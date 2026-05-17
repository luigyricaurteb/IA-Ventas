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

  // Body: type (full|partial), amount (monto aprobado), totalExpected (total del servicio)
  let body: { type?: "full" | "partial"; amount?: number; totalExpected?: number } = { type: "full" };
  try { body = await req.json() as typeof body; } catch {}

  const proof = db.prepare("SELECT * FROM payment_proofs WHERE id=?").get(proofId) as {
    id: number; conversation_id: number; deal_id: number | null;
    filename: string; reviewed: number;
    ai_amount: number | null; ai_reference: string | null; ai_payer: string | null;
    ai_date: string | null; ai_bank: string | null;
  } | null;

  if (!proof) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });
  if (proof.reviewed) return NextResponse.json({ error: "Ya fue revisado" }, { status: 400 });

  const deal = proof.deal_id
    ? db.prepare("SELECT * FROM crm_deals WHERE id=?").get(proof.deal_id) as {
        id: number; product_id: number | null; people_count: number | null;
        total_value: number | null; contact_id: number | null; paid_amount: number | null;
      } | null
    : null;

  const conversation = db.prepare("SELECT * FROM conversations WHERE id=?").get(proof.conversation_id) as {
    id: number; phone: string; name: string | null;
  } | null;

  const contact = db.prepare("SELECT * FROM contacts WHERE conversation_id=? LIMIT 1").get(proof.conversation_id) as {
    full_name: string | null; travel_date: string | null;
  } | null;

  const company = (db.prepare("SELECT * FROM company_config WHERE id=1").get() as {
    name: string | null;
  } | null) ?? { name: null };

  const product = deal?.product_id
    ? db.prepare("SELECT name FROM products WHERE id=?").get(deal.product_id) as { name: string } | null
    : null;

  const clientName  = contact?.full_name ?? conversation?.name ?? conversation?.phone ?? "Cliente";
  const companyName = company.name ?? "nuestra empresa";
  const travelDate  = contact?.travel_date;

  // Nombre del servicio: producto > notas del deal > "Servicio"
  const serviceName = product?.name
    ?? (db.prepare("SELECT service_name FROM reservations WHERE deal_id=? ORDER BY id DESC LIMIT 1").get(deal?.id ?? 0) as { service_name: string } | null)?.service_name
    ?? "Servicio";

  // Montos
  const approvedAmount = body.amount ?? proof.ai_amount ?? 0;
  const paidBefore     = deal?.paid_amount ?? 0;
  const newPaidTotal   = paidBefore + approvedAmount;

  // Total esperado: lo da el admin, o está en el deal, o 0 (desconocido)
  const totalExpected  = body.totalExpected ?? deal?.total_value ?? 0;

  // Si el admin especificó total, guardarlo en el deal
  if (deal && body.totalExpected && body.totalExpected > 0) {
    db.prepare("UPDATE crm_deals SET total_value=? WHERE id=?").run(body.totalExpected, deal.id);
  }

  const saldo = totalExpected > 0 ? Math.max(0, totalExpected - newPaidTotal) : 0;

  // REGLA CRÍTICA: el tipo lo decide el admin, no el sistema
  // "partial" siempre es abono, "full" siempre es pago completo
  const isFullyPaid = body.type === "full";

  // 1. Marcar comprobante como revisado
  db.prepare("UPDATE payment_proofs SET reviewed=1, reviewed_at=unixepoch() WHERE id=?").run(proofId);

  // 2. Actualizar paid_amount en deal
  if (deal) {
    db.prepare("UPDATE crm_deals SET paid_amount=? WHERE id=?").run(newPaidTotal, deal.id);

    if (isFullyPaid) {
      db.prepare("UPDATE crm_deals SET stage='GANADO', stage_changed_at=unixepoch(), updated_at=unixepoch() WHERE id=?").run(deal.id);
      db.prepare("INSERT INTO crm_activities (deal_id, type, description) VALUES (?,?,?)").run(deal.id, "payment",
        `Pago completo — $${approvedAmount.toLocaleString("es-CO")} COP`);
      db.prepare("UPDATE bot_conversation_state SET state='DONE', updated_at=unixepoch() WHERE conversation_id=?").run(proof.conversation_id);
    } else {
      db.prepare("UPDATE crm_deals SET stage='NEGOCIACION', updated_at=unixepoch() WHERE id=?").run(deal.id);
      db.prepare("INSERT INTO crm_activities (deal_id, type, description) VALUES (?,?,?)").run(deal.id, "payment",
        `Abono $${approvedAmount.toLocaleString("es-CO")} COP${saldo > 0 ? ` · Saldo: $${saldo.toLocaleString("es-CO")} COP` : ""}`);
    }

    db.prepare(`INSERT INTO partial_payments (deal_id, conversation_id, proof_id, amount, ai_amount, ai_reference, ai_payer, ai_date, ai_bank, verified)
      VALUES (?,?,?,?,?,?,?,?,?,1)`).run(
      deal.id, proof.conversation_id, proofId,
      approvedAmount, proof.ai_amount, proof.ai_reference, proof.ai_payer, proof.ai_date, proof.ai_bank
    );
  }

  // 3. Crear reserva SOLO si pago completo
  let reservation = null;
  let reservationCode: string | null = null;

  if (isFullyPaid && deal) {
    let serviceDate = Math.floor(Date.now() / 1000) + 86400;
    if (travelDate) { const p = Date.parse(travelDate); if (!isNaN(p)) serviceDate = Math.floor(p / 1000); }
    reservationCode = `RES-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    reservation = db.prepare(`
      INSERT INTO reservations (deal_id,contact_id,reservation_code,client_name,service_name,service_date,people_count,total_value,status,notes)
      VALUES (?,?,?,?,?,?,?,?,'confirmed',?) RETURNING *`
    ).get(
      deal.id, deal.contact_id ?? null, reservationCode,
      clientName, serviceName, serviceDate,
      deal.people_count ?? 1, totalExpected > 0 ? totalExpected : approvedAmount,
      travelDate ? `Fecha solicitada: ${travelDate}` : null
    );
  }

  // 4. Registrar ingreso en contabilidad
  if (approvedAmount > 0) {
    const paymentNote = isFullyPaid
      ? `Pago completo · Comprobante #${proofId}${proof.ai_reference ? ` · Ref: ${proof.ai_reference}` : ""}${proof.ai_bank ? ` · ${proof.ai_bank}` : ""}`
      : `Abono (${totalExpected > 0 ? Math.round((approvedAmount/totalExpected)*100) : "?"}%) · Comprobante #${proofId}${proof.ai_reference ? ` · Ref: ${proof.ai_reference}` : ""}${proof.ai_bank ? ` · ${proof.ai_bank}` : ""}${saldo > 0 ? ` · Saldo: $${saldo.toLocaleString("es-CO")} COP` : ""}`;

    db.prepare(`
      INSERT INTO accounting_income
        (reservation_id, deal_id, client_name, service_name, amount, currency,
         notes, income_date, proof_id, payment_type, balance_remaining, reservation_code, paid_total)
      VALUES (?,?,?,?,?,'COP',?,unixepoch(),?,?,?,?,?)
    `).run(
      reservation ? (reservation as { id: number }).id : null,
      deal?.id ?? null, clientName, serviceName, approvedAmount,
      paymentNote, proofId, isFullyPaid ? "full" : "partial",
      saldo, reservationCode, newPaidTotal
    );
  }

  // 5. Mensaje de confirmación al cliente por WhatsApp (via outbox)
  if (conversation) {
    let confirmMsg: string;
    const fmtAmt = (n: number) => `$${n.toLocaleString("es-CO")} COP`;

    if (isFullyPaid) {
      confirmMsg =
        `✅ *¡Tu reserva está confirmada, ${clientName}!*\n\n` +
        `📦 Servicio: ${serviceName}\n` +
        (deal?.people_count ? `👥 ${deal.people_count} persona${deal.people_count !== 1 ? "s" : ""}\n` : "") +
        (travelDate ? `📅 Fecha: ${travelDate}\n` : "") +
        (reservationCode ? `🔖 Código de reserva: *${reservationCode}*\n` : "") +
        `💰 Total pagado: *${fmtAmt(approvedAmount)}*\n\n` +
        `¡Gracias por confiar en *${companyName}*! Pronto recibirás todos los detalles. 🙏`;
    } else {
      confirmMsg =
        `✅ *Abono registrado, ${clientName}!*\n\n` +
        `📦 Servicio: ${serviceName}\n` +
        `💵 Abono recibido: *${fmtAmt(approvedAmount)}*\n` +
        `📊 Total pagado acumulado: *${fmtAmt(newPaidTotal)}*\n` +
        (totalExpected > 0 ? `💳 Total del servicio: ${fmtAmt(totalExpected)}\n` : "") +
        (saldo > 0 ? `⚠️ *Saldo pendiente: ${fmtAmt(saldo)}*\n` : "") +
        `\nUn asesor ha verificado tu pago. ${saldo > 0 ? "Tu reserva se activará cuando pagues el saldo pendiente." : "¡Gracias!"} 🙏`;
    }

    // Insertar en outbox para que el bot lo envíe por WhatsApp
    db.prepare("INSERT INTO outbox (conversation_id, phone, content) VALUES (?,?,?)").run(
      conversation.id, conversation.phone, confirmMsg
    );
    // También guardar en historial del chat
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(
      conversation.id, "assistant", confirmMsg
    );

    console.log(`[approve] Mensaje encolado para ${conversation.phone}: ${confirmMsg.slice(0,60)}...`);
  }

  return NextResponse.json({
    ok: true, reservation, isFullyPaid, saldo, newPaidTotal,
    totalExpected, approvedAmount, reservationCode
  });
}
