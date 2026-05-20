export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { upsertReservationInSheet } from "@/lib/sheets/sync";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const resId = Number(id);
  const body = await req.json();

  const allowed = ["deal_id","contact_id","client_name","service_name","service_date",
    "people_count","service_price","discount","total_value","amount_paid","status","notes"];
  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  // Read current state before update to detect amount_paid increase
  const current = db.prepare(
    "SELECT amount_paid, client_name, service_name, reservation_code FROM reservations WHERE id=?"
  ).get(resId) as {
    amount_paid: number; client_name: string | null;
    service_name: string | null; reservation_code: string | null;
  } | null;

  const sets = fields.map((f) => `${f} = ?`).join(", ");
  db.prepare(
    `UPDATE reservations SET ${sets}, updated_at = unixepoch() WHERE id = ?`
  ).run(...fields.map((f) => body[f]), resId);

  // If amount_paid increased → register difference in accounting
  if ("amount_paid" in body && current) {
    const oldPaid = current.amount_paid ?? 0;
    const newPaid = Number(body.amount_paid ?? 0);
    const diff = newPaid - oldPaid;

    if (diff > 0) {
      const now = Math.floor(Date.now() / 1000);
      const clientName = body.client_name ?? current.client_name ?? "Cliente";
      const serviceName = body.service_name ?? current.service_name ?? "Servicio";
      const code = current.reservation_code ?? `#${resId}`;
      const desc = `Pago reserva ${code} — ${clientName} — ${serviceName}`;
      try {
        db.prepare(`
          INSERT INTO accounting_income
            (reservation_id, client_name, service_name, amount, currency, notes, reservation_code, income_date, created_at)
          VALUES (?, ?, ?, ?, 'COP', ?, ?, ?, ?)
        `).run(resId, clientName, serviceName, diff, desc, code, now, now);
      } catch (e) {
        console.error("[calendar PATCH] Error registrando ingreso:", (e as Error).message);
      }
    }
  }

  // Auto-sync to Google Sheet if enabled
  const sheetCfg = db.prepare("SELECT sheets_url, sheets_enabled FROM company_config WHERE id=1")
    .get() as { sheets_url: string | null; sheets_enabled: number } | null;
  if (sheetCfg?.sheets_enabled === 1 && sheetCfg.sheets_url) {
    upsertReservationInSheet(db, sheetCfg.sheets_url, resId)
      .catch((e) => console.error("[sheets] auto-sync error:", (e as Error).message));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  db.prepare("DELETE FROM reservations WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
