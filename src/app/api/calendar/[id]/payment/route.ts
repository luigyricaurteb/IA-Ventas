export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { sendAlert } from "@/lib/email";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const resId = Number(id);
  const body = await req.json() as { amount: number; reference?: string; notes?: string };

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
  }

  const res = db.prepare(`
    SELECT r.*, COALESCE(ct.full_name, r.client_name) as display_name
    FROM reservations r
    LEFT JOIN contacts ct ON r.contact_id = ct.id
    WHERE r.id = ?
  `).get(resId) as {
    id: number; reservation_code: string | null; client_name: string | null; display_name: string | null;
    service_name: string | null; total_value: number | null; amount_paid: number;
    discount: number; service_price: number | null; people_count: number;
  } | null;

  if (!res) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  const newAmountPaid = (res.amount_paid ?? 0) + body.amount;
  const total = res.total_value ?? 0;
  const saldo = Math.max(0, total - newAmountPaid);

  // Update reservation
  db.prepare(`
    UPDATE reservations SET amount_paid = ?, updated_at = unixepoch(),
    status = CASE WHEN ? <= 0 THEN 'confirmed' ELSE status END
    WHERE id = ?
  `).run(newAmountPaid, saldo, resId);

  // Register in accounting
  const now = Math.floor(Date.now() / 1000);
  const desc = `Pago reserva ${res.reservation_code ?? `#${resId}`} — ${res.display_name ?? res.client_name ?? "Cliente"} — ${res.service_name ?? "Servicio"}${body.reference ? ` (Ref: ${body.reference})` : ""}`;
  try {
    db.prepare(`
      INSERT INTO accounting_income (reservation_id, client_name, service_name, amount, currency, notes, reservation_code, income_date, created_at)
      VALUES (?, ?, ?, ?, 'COP', ?, ?, ?, ?)
    `).run(resId, res.display_name ?? res.client_name, res.service_name, body.amount, desc, res.reservation_code, now, now);
  } catch (e) {
    console.error("[payment] Error registrando ingreso:", (e as Error).message);
  }

  // Send email alert
  sendAlert(db, "new_payment", {
    client: res.display_name ?? res.client_name ?? "Cliente",
    service: res.service_name ?? "",
    amount: body.amount,
    paid_total: newAmountPaid,
    saldo,
    type: saldo <= 0 ? "full" : "partial",
    reference: body.reference ?? "",
    reservation_code: res.reservation_code ?? `#${resId}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, amount_paid: newAmountPaid, saldo, status: saldo <= 0 ? "confirmed" : "pending" });
}
