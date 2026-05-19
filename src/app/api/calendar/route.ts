import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { upsertReservationInSheet } from "@/lib/sheets/sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { searchParams } = new URL(req.url);
  const view   = searchParams.get("view") ?? "month";
  const year   = Number(searchParams.get("year")  ?? new Date().getFullYear());
  const month  = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const status = searchParams.get("status") ?? null;
  const page   = Number(searchParams.get("page") ?? 0);

  if (view === "month") {
    // Start and end of month as unix timestamps
    const start = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
    const end   = Math.floor(new Date(year, month, 1).getTime() / 1000);

    const reservations = db.prepare(
      "SELECT * FROM reservations WHERE service_date >= ? AND service_date < ? ORDER BY service_date ASC"
    ).all(start, end);

    // Count by day
    const rawCounts = db.prepare(`
      SELECT strftime('%d', datetime(service_date, 'unixepoch')) as day, COUNT(*) as count
      FROM reservations WHERE service_date >= ? AND service_date < ?
      GROUP BY day
    `).all(start, end) as { day: string; count: number }[];
    const countByDay = Object.fromEntries(rawCounts.map((r) => [Number(r.day), r.count]));

    return NextResponse.json({ reservations, countByDay });
  }

  if (view === "list") {
    const limit = 50;
    const offset = page * limit;
    const whereClause = status ? "WHERE status = ?" : "";
    const args = status ? [status, limit, offset] : [limit, offset];

    const rows = db.prepare(
      `SELECT * FROM reservations ${whereClause} ORDER BY service_date DESC LIMIT ? OFFSET ?`
    ).all(...args);

    const totalRow = db.prepare(
      `SELECT COUNT(*) as c FROM reservations ${whereClause}`
    ).get(...(status ? [status] : [])) as { c: number };

    return NextResponse.json({ rows, total: totalRow.c, page });
  }

  return NextResponse.json({ error: "view inválido" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.service_date) {
    return NextResponse.json({ error: "Fecha requerida" }, { status: 400 });
  }

  const code = `RES-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const reservation = db.prepare(`
    INSERT INTO reservations
      (deal_id, contact_id, reservation_code, client_name, service_name,
       service_date, people_count, service_price, discount, total_value, amount_paid, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    body.deal_id      ?? null,
    body.contact_id   ?? null,
    code,
    body.client_name  ?? null,
    body.service_name ?? null,
    Number(body.service_date),
    Number(body.people_count ?? 1),
    body.service_price ? Number(body.service_price) : null,
    Number(body.discount ?? 0),
    body.total_value  ? Number(body.total_value) : null,
    Number(body.amount_paid ?? 0),
    body.status       ?? "pending",
    body.notes        ?? null,
  );

  // Register initial payment in accounting if amount_paid > 0
  if (Number(body.amount_paid ?? 0) > 0) {
    const now = Math.floor(Date.now() / 1000);
    const desc = `Abono inicial reserva ${code} — ${body.client_name ?? "Cliente"} — ${body.service_name ?? "Servicio"}`;
    try {
      db.prepare("INSERT INTO accounting_income (amount, description, category, date, created_at) VALUES (?,?,'reservas',?,?)").run(Number(body.amount_paid), desc, now, now);
    } catch { try { db.prepare("INSERT INTO income (amount, description, category, date, created_at) VALUES (?,?,'reservas',?,?)").run(Number(body.amount_paid), desc, now, now); } catch {} }
  }

  // Auto-sync to Google Sheet if enabled
  const sheetCfg = db.prepare("SELECT sheets_url, sheets_enabled FROM company_config WHERE id=1").get() as { sheets_url: string | null; sheets_enabled: number } | null;
  if (sheetCfg?.sheets_enabled === 1 && sheetCfg.sheets_url && (reservation as { id: number } | null)?.id) {
    upsertReservationInSheet(db, sheetCfg.sheets_url, (reservation as { id: number }).id)
      .catch((e) => console.error("[sheets] auto-sync error:", (e as Error).message));
  }

  return NextResponse.json({ reservation }, { status: 201 });
}
