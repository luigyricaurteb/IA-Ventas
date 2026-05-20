export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // All reservations with amount_paid > 0
  const reservations = db.prepare(`
    SELECT id, client_name, service_name, amount_paid, reservation_code, created_at
    FROM reservations WHERE amount_paid > 0
  `).all() as {
    id: number; client_name: string | null; service_name: string | null;
    amount_paid: number; reservation_code: string | null; created_at: number;
  }[];

  let synced = 0;
  let skipped = 0;

  for (const r of reservations) {
    // Check if an accounting entry already exists for this reservation
    // by reservation_id OR by reservation_code (handles NULL reservation_id cases)
    const existing = db.prepare(`
      SELECT id FROM accounting_income
      WHERE reservation_id = ?
         OR (reservation_code IS NOT NULL AND reservation_code = ?)
      LIMIT 1
    `).get(r.id, r.reservation_code ?? "") as { id: number } | null;

    if (existing) { skipped++; continue; }

    try {
      const code = r.reservation_code ?? `#${r.id}`;
      const desc = `Pago reserva ${code} — ${r.client_name ?? "Cliente"} — ${r.service_name ?? "Servicio"} (sincronizado manualmente)`;
      db.prepare(`
        INSERT INTO accounting_income
          (reservation_id, client_name, service_name, amount, currency, notes,
           reservation_code, income_date, created_at)
        VALUES (?, ?, ?, ?, 'COP', ?, ?, ?, ?)
      `).run(
        r.id, r.client_name, r.service_name, r.amount_paid,
        desc, code, r.created_at, r.created_at
      );
      synced++;
    } catch (e) {
      console.error(`[sync-accounting] Error reserva ${r.id}:`, (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, synced, skipped, total: reservations.length });
}

// GET: preview of what would be synced
export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const reservations = db.prepare(
    "SELECT id, client_name, service_name, amount_paid, reservation_code FROM reservations WHERE amount_paid > 0"
  ).all() as { id: number; client_name: string | null; service_name: string | null; amount_paid: number; reservation_code: string | null }[];

  const pending = reservations.filter(r => {
    const existing = db.prepare(`
      SELECT id FROM accounting_income
      WHERE reservation_id = ?
         OR (reservation_code IS NOT NULL AND reservation_code = ?)
      LIMIT 1
    `).get(r.id, r.reservation_code ?? "") as { id: number } | null;
    return !existing;
  });

  return NextResponse.json({ pending, total: reservations.length });
}
