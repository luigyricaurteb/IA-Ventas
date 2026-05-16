import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // Embudo de conversión
  const stages = ["NUEVO","CALIFICADO","PROPUESTA","NEGOCIACION","GANADO","PERDIDO"];
  const funnelRaw = db.prepare(
    "SELECT stage, COUNT(*) as count FROM crm_deals GROUP BY stage"
  ).all() as { stage: string; count: number }[];
  const funnelMap = Object.fromEntries(funnelRaw.map((r) => [r.stage, r.count]));
  const funnel = stages.map((s) => ({ stage: s, count: funnelMap[s] ?? 0 }));
  const totalDeals = funnel.reduce((a, b) => a + b.count, 0);
  const wonDeals   = funnelMap["GANADO"] ?? 0;
  const conversionRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;

  // Rentabilidad por producto
  const byProduct = db.prepare(`
    SELECT p.name, COUNT(d.id) as sales,
           COALESCE(SUM(d.total_value), 0) as revenue,
           COALESCE(AVG(d.people_count), 0) as avg_people
    FROM products p
    LEFT JOIN crm_deals d ON d.product_id = p.id AND d.stage = 'GANADO'
    GROUP BY p.id ORDER BY revenue DESC
  `).all() as { name: string; sales: number; revenue: number; avg_people: number }[];

  // Ingresos por mes (últimos 6 meses)
  const monthlyIncome = db.prepare(`
    SELECT strftime('%Y-%m', datetime(income_date, 'unixepoch')) as month,
           SUM(amount) as total
    FROM accounting_income
    WHERE income_date > unixepoch() - (180 * 86400)
    GROUP BY month ORDER BY month ASC
  `).all() as { month: string; total: number }[];

  // Tiempo promedio de cierre (NUEVO → GANADO en días)
  const avgCloseTime = (db.prepare(`
    SELECT AVG(CAST(updated_at - created_at AS REAL) / 86400) as avg_days
    FROM crm_deals WHERE stage = 'GANADO'
  `).get() as { avg_days: number | null })?.avg_days ?? 0;

  // Mensajes totales y conversaciones activas
  const totalConversations = (db.prepare(
    "SELECT COUNT(*) as c FROM conversations"
  ).get() as { c: number }).c;

  const activeToday = (db.prepare(`
    SELECT COUNT(*) as c FROM conversations WHERE last_message_at > unixepoch() - 86400
  `).get() as { c: number }).c;

  return NextResponse.json({
    funnel, conversionRate, totalDeals, wonDeals,
    byProduct, monthlyIncome,
    avgCloseTimeDays: Math.round(avgCloseTime),
    totalConversations, activeToday,
  });
}
