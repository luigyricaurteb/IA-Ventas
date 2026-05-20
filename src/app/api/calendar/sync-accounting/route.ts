export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

// Sincroniza reservas que tienen amount_paid > 0 pero no tienen entrada en accounting_income
export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // Find reservations with amount_paid > 0 that have NO accounting entry
  const unsynced = db.prepare(`
    SELECT r.id, r.client_name, r.service_name, r.amount_paid,
           r.reservation_code, r.created_at
    FROM reservations r
    WHERE r.amount_paid > 0
      AND NOT EXISTS (
        SELECT 1 FROM accounting_income ai WHERE ai.reservation_id = r.id
      )
  `).all() as {
    id: number; client_name: string | null; service_name: string | null;
    amount_paid: number; reservation_code: string | null; created_at: number;
  }[];

  let synced = 0;
  for (const r of unsynced) {
    try {
      const code = r.reservation_code ?? `#${r.id}`;
      const desc = `Pago reserva ${code} — ${r.client_name ?? "Cliente"} — ${r.service_name ?? "Servicio"} (sincronizado)`;
      db.prepare(`
        INSERT INTO accounting_income
          (reservation_id, client_name, service_name, amount, currency, notes, reservation_code, income_date, created_at)
        VALUES (?, ?, ?, ?, 'COP', ?, ?, ?, ?)
      `).run(r.id, r.client_name, r.service_name, r.amount_paid, desc, code, r.created_at, r.created_at);
      synced++;
    } catch (e) {
      console.error(`[sync-accounting] Error en reserva ${r.id}:`, (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, synced, total: unsynced.length });
}
