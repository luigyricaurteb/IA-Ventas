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

  // Leer body para saber si es abono o pago completo
  let body: { type?: "full" | "partial"; amount?: number } = { type: "full" };
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

  const company = db.prepare("SELECT * FROM company_config WHERE id=1").get() as {
    name: string | null; nequi_phone: string | null; daviplata_phone: string | null;
  } | null ?? { name: null, nequi_phone: null, daviplata_phone: null };

  const product = deal?.product_id
    ? db.prepare("SELECT name FROM products WHERE id=?").get(deal.product_id) as { name: string } | null
    : null;

  const clientName  = contact?.full_name ?? conversation?.name ?? conversation?.phone ?? "Cliente";
  const serviceName = product?.name ?? "Servicio";
  const travelDate  = contact?.travel_date;
  const companyName = company.name ?? "nuestra empresa";
  const totalValue  = deal?.total_value ?? 0;
  const paidBefore  = deal?.paid_amount ?? 0;

  // Monto aprobado: usar ai_amount si existe, o el que manda el admin, o el total
  const approvedAmount = body.amount ?? proof.ai_amount ?? totalValue;
  const newPaidTotal   = paidBefore + approvedAmount;
  const saldo          = Math.max(0, totalValue - newPaidTotal);
  const isFullyPaid    = saldo <= 0 || body.type === "full";

  // 1. Marcar comprobante como revisado
  db.prepare("UPDATE payment_proofs SET reviewed=1, reviewed_at=unixepoch() WHERE id=?").run(proofId);

  // 2. Actualizar paid_amount en deal
  if (deal) {
    db.prepare("UPDATE crm_deals SET paid_amount=? WHERE id=?").run(newPaidTotal, deal.id);

    if (isFullyPaid) {
      // Pago completo → GANADO
      db.prepare("UPDATE crm_deals SET stage='GANADO', stage_changed_at=unixepoch(), updated_at=unixepoch() WHERE id=?").run(deal.id);
      db.prepare("INSERT INTO crm_activities (deal_id, type, description) VALUES (?,?,?)").run(deal.id, "payment", `Pago completo verificado — $${newPaidTotal.toLocaleString("es-CO")} COP`);
      db.prepare("UPDATE bot_conversation_state SET state='DONE', updated_at=unixepoch() WHERE conversation_id=?").run(proof.conversation_id);
    } else {
      // Abono parcial → sigue en NEGOCIACION
      db.prepare("UPDATE crm_deals SET stage='NEGOCIACION', updated_at=unixepoch() WHERE id=?").run(deal.id);
      db.prepare("INSERT INTO crm_activities (deal_id, type, description) VALUES (?,?,?)").run(deal.id, "payment", `Abono verificado — $${approvedAmount.toLocaleString("es-CO")} COP. Saldo: $${saldo.toLocaleString("es-CO")} COP`);
    }

    // Registrar pago parcial
    db.prepare(`INSERT INTO partial_payments (deal_id, conversation_id, proof_id, amount, ai_amount, ai_reference, ai_payer, ai_date, ai_bank, verified)
      VALUES (?,?,?,?,?,?,?,?,?,1)`).run(
      deal.id, proof.conversation_id, proofId,
      approvedAmount, proof.ai_amount, proof.ai_reference, proof.ai_payer, proof.ai_date, proof.ai_bank
    );
  }

  // 3. Crear reserva solo si pago completo
  let reservation = null;
  if (isFullyPaid && deal) {
    let serviceDate = Math.floor(Date.now() / 1000) + 86400;
    if (travelDate) { const p = Date.parse(travelDate); if (!isNaN(p)) serviceDate = Math.floor(p / 1000); }
    const code = `RES-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    reservation = db.prepare(`INSERT INTO reservations (deal_id,contact_id,reservation_code,client_name,service_name,service_date,people_count,total_value,status,notes) VALUES (?,?,?,?,?,?,?,?,'confirmed',?) RETURNING *`)
      .get(deal.id, deal.contact_id ?? null, code, clientName, serviceName, serviceDate, deal.people_count ?? 1, totalValue, travelDate ? `Fecha: ${travelDate}` : null);

    // Ingreso en contabilidad
    if (totalValue > 0) {
      db.prepare("INSERT INTO accounting_income (reservation_id,deal_id,client_name,service_name,amount,currency,notes,income_date) VALUES (?,?,?,?,?,'COP',?,?)")
        .run((reservation as { id: number }).id, deal.id, clientName, serviceName, totalValue, "Pago completo verificado", Math.floor(Date.now()/1000));
    }
  }

  // 4. Enviar mensaje al cliente
  if (conversation) {
    let confirmMsg: string;
    if (isFullyPaid) {
      confirmMsg = `✅ *¡Tu reserva está confirmada, ${clientName}!*\n\n` +
        `📦 ${serviceName}\n👥 ${deal?.people_count ?? 1} persona${(deal?.people_count ?? 1) !== 1 ? "s" : ""}\n` +
        `📅 Fecha: ${travelDate ?? "Por coordinar"}\n💰 Total: $${totalValue.toLocaleString("es-CO")} COP\n\n` +
        `¡Gracias por confiar en *${companyName}*! Pronto recibirás todos los detalles. 🙏`;
    } else {
      confirmMsg = `✅ *Abono registrado, ${clientName}!*\n\n` +
        `💵 Abono recibido: *$${approvedAmount.toLocaleString("es-CO")} COP*\n` +
        `📊 Total pagado: $${newPaidTotal.toLocaleString("es-CO")} COP\n` +
        `⚠️ Saldo pendiente: *$${saldo.toLocaleString("es-CO")} COP*\n\n` +
        `Tu reserva se activará cuando pagues el saldo completo. ¡Gracias! 🙏`;
    }
    db.prepare("INSERT INTO outbox (conversation_id, phone, content) VALUES (?,?,?)").run(conversation.id, conversation.phone, confirmMsg);
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conversation.id, "assistant", confirmMsg);
  }

  return NextResponse.json({ ok: true, reservation, isFullyPaid, saldo, newPaidTotal, totalValue });
}
