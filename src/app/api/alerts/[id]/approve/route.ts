import { NextRequest, NextResponse } from "next/server";
import db, {
  markProofReviewed, insertReservation, enqueueOutbox,
  getCompanyConfig, getContactByConversation, insertIncome,
} from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const proofId = Number(id);

  // Obtener datos del comprobante
  const proof = db.prepare<[number], {
    id: number; conversation_id: number; deal_id: number | null;
    filename: string; reviewed: number;
  }>("SELECT * FROM payment_proofs WHERE id = ?").get(proofId);

  if (!proof) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });
  if (proof.reviewed) return NextResponse.json({ error: "Ya fue revisado" }, { status: 400 });

  // Obtener deal y conversación
  const deal = proof.deal_id
    ? db.prepare<[number], { id: number; product_id: number | null; people_count: number | null; total_value: number | null; contact_id: number | null }>(
        "SELECT * FROM crm_deals WHERE id = ?"
      ).get(proof.deal_id)
    : null;

  const conversation = db.prepare<[number], { id: number; phone: string; name: string | null }>(
    "SELECT * FROM conversations WHERE id = ?"
  ).get(proof.conversation_id);

  const contact = getContactByConversation(proof.conversation_id);
  const company = getCompanyConfig();

  // Producto seleccionado
  const product = deal?.product_id
    ? db.prepare<[number], { name: string }>("SELECT name FROM products WHERE id = ?").get(deal.product_id)
    : null;

  const clientName   = contact?.full_name ?? conversation?.name ?? conversation?.phone ?? "Cliente";
  const serviceName  = product?.name ?? "Servicio DMC";
  const travelDate   = contact?.travel_date;
  const companyName  = company.name ?? "nuestra empresa";

  // 1. Marcar como revisado
  markProofReviewed(proofId);

  // 2. Mover deal a GANADO
  if (deal) {
    db.prepare("UPDATE crm_deals SET stage = 'GANADO', stage_changed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?").run(deal.id);
    db.prepare("INSERT INTO crm_activities (deal_id, type, description) VALUES (?, 'stage_change', 'Pago verificado — Etapa cambiada a GANADO')").run(deal.id);
    // Actualizar estado bot
    db.prepare("UPDATE bot_conversation_state SET state = 'DONE', updated_at = unixepoch() WHERE conversation_id = ?").run(proof.conversation_id);
  }

  // 3. Crear reserva en el calendario
  let serviceDate = Math.floor(Date.now() / 1000) + 86400; // por defecto mañana
  if (travelDate) {
    const parsed = Date.parse(travelDate);
    if (!isNaN(parsed)) serviceDate = Math.floor(parsed / 1000);
  }

  const reservation = insertReservation({
    deal_id:      deal?.id      ?? null,
    contact_id:   deal?.contact_id ?? null,
    client_name:  clientName,
    service_name: serviceName,
    service_date: serviceDate,
    people_count: deal?.people_count ?? 1,
    total_value:  deal?.total_value  ?? null,
    status:       "confirmed",
    notes:        travelDate ? `Fecha solicitada: ${travelDate}` : null,
  });

  // 4. Generar ingreso automático en contabilidad
  if (deal?.total_value) {
    insertIncome({
      reservation_id: reservation.id,
      deal_id:        deal.id,
      client_name:    clientName,
      service_name:   serviceName,
      amount:         deal.total_value,
      currency:       "COP",
      notes:          `Pago verificado automáticamente al aprobar comprobante`,
      income_date:    Math.floor(Date.now() / 1000),
    });
  }

  // 5. Enviar mensaje de confirmación al cliente vía outbox
  if (conversation) {
    const bankInfo = (db.prepare(
      "SELECT bank_name, account_type, account_number FROM bank_accounts WHERE active = 1"
    ).all() as { bank_name: string; account_type: string; account_number: string }[]).map(
      (b) => `🏦 ${b.bank_name} · ${b.account_number}`
    ).join("\n");

    const confirmMsg =
      `✅ *¡Tu reserva está confirmada, ${clientName}!*\n\n` +
      `📦 Servicio: ${serviceName}\n` +
      `👥 Personas: ${deal?.people_count ?? 1}\n` +
      `📅 Fecha: ${travelDate ?? "Por coordinar"}\n` +
      `💰 Total pagado: $${deal?.total_value?.toLocaleString("es-CO") ?? "—"} COP\n\n` +
      `Pronto te enviaremos todos los detalles de tu reserva. ¡Gracias por confiar en *${companyName}*! 🙏`;

    enqueueOutbox(conversation.id, conversation.phone, confirmMsg);

    // Insertar también en el historial del chat
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)").run(conversation.id, confirmMsg);
  }

  return NextResponse.json({ ok: true, reservation });
}
