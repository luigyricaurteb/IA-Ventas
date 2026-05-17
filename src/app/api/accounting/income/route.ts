import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { searchParams } = new URL(req.url);
  const search      = searchParams.get("q")?.toLowerCase() ?? "";
  const paymentType = searchParams.get("type") ?? ""; // full|partial|""
  const dateFrom    = searchParams.get("from");
  const dateTo      = searchParams.get("to");

  const conditions: string[] = [];
  const args: unknown[]      = [];

  if (search) {
    conditions.push("(LOWER(ai.client_name) LIKE ? OR LOWER(ai.service_name) LIKE ? OR ai.reservation_code LIKE ?)");
    args.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (paymentType) { conditions.push("ai.payment_type = ?"); args.push(paymentType); }
  if (dateFrom) {
    const ts = Math.floor(new Date(dateFrom).getTime() / 1000);
    conditions.push("ai.income_date >= ?"); args.push(ts);
  }
  if (dateTo) {
    const ts = Math.floor(new Date(dateTo + "T23:59:59").getTime() / 1000);
    conditions.push("ai.income_date <= ?"); args.push(ts);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const income = db.prepare(`
    SELECT ai.*,
      pp.filename    as proof_filename,
      pp.ai_bank     as proof_bank,
      pp.ai_payer    as proof_payer,
      pp.ai_reference as proof_reference
    FROM accounting_income ai
    LEFT JOIN payment_proofs pp ON ai.proof_id = pp.id
    ${where}
    ORDER BY ai.income_date DESC
    LIMIT 200
  `).all(...args);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN payment_type='full'    THEN amount ELSE 0 END), 0) as total_full,
      COALESCE(SUM(CASE WHEN payment_type='partial' THEN amount ELSE 0 END), 0) as total_partial,
      COALESCE(SUM(amount), 0) as total_all
    FROM accounting_income ai ${where}
  `).get(...args) as { total_full: number; total_partial: number; total_all: number };

  return NextResponse.json({ income, totals });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as {
    client_name?: string; service_name?: string; amount?: number;
    currency?: string; notes?: string; income_date?: string;
    reservation_code?: string;
  };
  if (!body.amount) return NextResponse.json({ error: "Monto requerido" }, { status: 400 });

  const ts = body.income_date
    ? Math.floor(new Date(body.income_date).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const row = db.prepare(`
    INSERT INTO accounting_income
      (client_name, service_name, amount, currency, notes, income_date, payment_type, reservation_code)
    VALUES (?,?,?,?,?,?,'manual',?) RETURNING *
  `).get(
    body.client_name ?? null, body.service_name ?? null,
    body.amount, body.currency ?? "COP", body.notes ?? null, ts,
    body.reservation_code ?? null
  );

  return NextResponse.json({ income: row }, { status: 201 });
}
