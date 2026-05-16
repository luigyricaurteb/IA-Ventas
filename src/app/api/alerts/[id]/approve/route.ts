import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const proofId = Number(id);

  // Obtener datos del comprobante
  const proof = db.prepare(
    "SELECT * FROM payment_proofs WHERE id = ?"
  ).get(proofId) as {
    id: number; conversation_id: number; deal_id: number | null;
    filename: string; reviewed: number;
  } | null;

  if (!proof) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });
  if (proof.reviewed) return NextResponse.json({ error: "Ya fue revisado" }, { status: 400 });

  // Obtener deal
  const deal = proof.deal_id
    ? db.prepare(
        "SELECT * FROM crm_deals WHERE id = ?"
      ).get(proof.deal_id) as {
        id: number; product_id: number | null; people_count: number | null;
        total_value: number | null; contact_id: number | null;
      } | null
    : null;

  const conversation = db.prepare(
    "SELECT * FROM conversations WHERE id = ?"
  ).get(proof.conversation_id) as { id: number; phone: string; name: string | null } | null;

  const contact = db.prepare(
    "SELECT * FROM contacts WHERE conversation_id = ? LIMIT 1"
  ).get(proof.conversation_id) as {
    full_name: string | null; travel_date: string | null;
  } | null;

  const company = db.prepare(
    "SELECT * FROM company_config WHERE id = 1"
  ).get() as {
    name: string | null; nequi_phone: string | null; daviplata_phone: string | null;
  } | null ?? { name: null, nequi_phone: null, daviplata_phone: null };

  const product = deal?.product_id
    ? db.prepare("SELECT name FROM products WHERE id = ?").get(deal.product_id) as { name: string } | null
    : null;

  const clientName   = contact?.full_name ?? conversation?.name ?? conversation?.phone ?? "Cliente";
  const serviceName  = product?.name ?? "Servicio DMC";
  const travelDate   = contact?.travel_date;
  const companyName  = company.name ?? "nuestra empresa";

  // 1. Marcar como revisado
  db.prepare(
    "UPDATE payment_proofs SET reviewed = 1, reviewed_at = unixepoch() WHERE id = ?"
  ).run(proofId);

  // 2. Mover deal a GANADO
  if (deal) {
    db.prepare(
      "UPDATE crm_deals SET stage = 'GANADO', stage_changed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?"
    ).run(deal.id);
    db.prepare(
      "INSERT INTO crm_activities (deal_id, type, description) VALUES (?, 'stage_change', 'Pago verificado — Etapa cambiada a GANADO')"
    ).run(deal.id);
    db.prepare(
      "UPDATE bot_conversation_state SET state = 'DONE', updated_at = unixepoch() WHERE conversation_id = ?"
    ).run(proof.conversation_id);
  }

  // 3. Crear reserva en el calendario
  let serviceDate = Math.floor(Date.now() / 1000) + 86400;
  if (travelDate) {
    const parsed = Date.parse(travelDate);
    if (!isNaN(parsed)) serviceDate = Math.floor(parsed / 1000);
  }

  const code = `RES-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const reservation = db.prepare(`
    INSERT INTO reservations
      (deal_id, contact_id, reservation_code, client_name, service_name,
       service_date, people_count, total_value, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
    RETURNING *
  `).get(
    deal?.id ?? null,
    deal?.contact_id ?? null,
    code,
    clientName,
    serviceName,
    serviceDate,
    deal?.people_count ?? 1,
    deal?.total_value ?? null,
    travelDate ? `Fecha solicitada: ${travelDate}` : null,
  );

  // 4. Generar ingreso automático en contabilidad
  if (deal?.total_value) {
    db.prepare(`
      INSERT INTO accounting_income
        (reservation_id, deal_id, client_name, service_name, amount, currency, notes, income_date)
      VALUES (?, ?, ?, ?, ?, 'COP', 'Pago verificado automáticamente al aprobar comprobante', ?)
    `).run(
      (reservation as { id: number }).id,
      deal.id,
      clientName,
      serviceName,
      deal.total_value,
      Math.floor(Date.now() / 1000),
    );
  }

  // 5. Enviar mensaje de confirmación al cliente vía outbox
  if (conversation) {
    const confirmMsg =
      `✅ *¡Tu reserva está confirmada, ${clientName}!*\n\n` +
      `📦 Servicio: ${serviceName}\n` +
      `👥 Personas: ${deal?.people_count ?? 1}\n` +
      `📅 Fecha: ${travelDate ?? "Por coordinar"}\n` +
      `💰 Total pagado: $${deal?.total_value?.toLocaleString("es-CO") ?? "—"} COP\n\n` +
      `Pronto te enviaremos todos los detalles de tu reserva. ¡Gracias por confiar en *${companyName}*! 🙏`;

    db.prepare(
      "INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)"
    ).run(conversation.id, conversation.phone, confirmMsg);

    db.prepare(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)"
    ).run(conversation.id, confirmMsg);
  }

  return NextResponse.json({ ok: true, reservation });
}
