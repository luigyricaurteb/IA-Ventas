import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { searchParams } = new URL(req.url);
  const now   = Math.floor(Date.now() / 1000);
  const start = Number(searchParams.get("start") ?? now - 30 * 86400);
  const end   = Number(searchParams.get("end")   ?? now);

  const totalIncome = (db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM accounting_income WHERE income_date BETWEEN ? AND ?"
  ).get(start, end) as { total: number }).total;

  const totalExpenses = (db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM accounting_expense WHERE expense_date BETWEEN ? AND ?"
  ).get(start, end) as { total: number }).total;

  const incomeByMonth = db.prepare(`
    SELECT strftime('%Y-%m', datetime(income_date, 'unixepoch')) as month,
           SUM(amount) as total
    FROM accounting_income WHERE income_date BETWEEN ? AND ?
    GROUP BY month ORDER BY month ASC
  `).all(start, end) as { month: string; total: number }[];

  const expenseByCategory = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM accounting_expense WHERE expense_date BETWEEN ? AND ?
    GROUP BY category ORDER BY total DESC
  `).all(start, end) as { category: string; total: number }[];

  const summary = {
    totalIncome,
    totalExpenses,
    netProfit: totalIncome - totalExpenses,
    incomeByMonth,
    expenseByCategory,
  };

  return NextResponse.json({ summary, start, end });
}
