import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const expenses = db.prepare(
    "SELECT * FROM accounting_expense ORDER BY expense_date DESC"
  ).all();

  return NextResponse.json({ expenses });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.description || !body.amount) {
    return NextResponse.json({ error: "Descripción y monto requeridos" }, { status: 400 });
  }

  const expense = db.prepare(`
    INSERT INTO accounting_expense
      (supplier_id, reservation_id, deal_id, category, description, amount, currency, expense_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    body.supplier_id    ?? null,
    body.reservation_id ?? null,
    body.deal_id        ?? null,
    body.category       ?? "general",
    body.description,
    Number(body.amount),
    body.currency       ?? "COP",
    body.expense_date   ? Number(body.expense_date) : Math.floor(Date.now() / 1000),
  );

  return NextResponse.json({ expense }, { status: 201 });
}
