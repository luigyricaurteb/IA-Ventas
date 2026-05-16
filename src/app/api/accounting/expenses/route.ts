import { NextRequest, NextResponse } from "next/server";
import { listExpenses, insertExpense } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ expenses: listExpenses() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.description || !body.amount) {
    return NextResponse.json({ error: "Descripción y monto requeridos" }, { status: 400 });
  }
  const expense = insertExpense({
    supplier_id:    body.supplier_id    ?? null,
    reservation_id: body.reservation_id ?? null,
    deal_id:        body.deal_id        ?? null,
    category:       body.category       ?? "general",
    description:    body.description,
    amount:         Number(body.amount),
    currency:       body.currency       ?? "COP",
    expense_date:   body.expense_date   ? Number(body.expense_date) : Math.floor(Date.now() / 1000),
  });
  return NextResponse.json({ expense }, { status: 201 });
}
