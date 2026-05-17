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

  // Conversaciones
  const totalConversations = (db.prepare("SELECT COUNT(*) as c FROM conversations").get() as { c: number }).c;
  const activeToday = (db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE last_message_at > unixepoch() - 86400`).get() as { c: number }).c;

  // Ingresos totales y del mes actual
  const totalIncome = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM accounting_income").get() as { t: number }).t;
  const thisMonthIncome = (db.prepare(`
    SELECT COALESCE(SUM(amount),0) as t FROM accounting_income
    WHERE income_date >= strftime('%s', date('now','start of month'))
  `).get() as { t: number }).t;

  // Reservas
  const reservations = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status='pending'   THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
    FROM reservations
  `).get() as { total: number; confirmed: number; pending: number; completed: number };

  // Próximas reservas (7 días)
  const upcomingReservations = db.prepare(`
    SELECT client_name, service_name, service_date, people_count, status, reservation_code
    FROM reservations
    WHERE service_date BETWEEN unixepoch() AND unixepoch() + (7 * 86400)
    ORDER BY service_date ASC LIMIT 5
  `).all() as { client_name: string | null; service_name: string | null; service_date: number; people_count: number; status: string; reservation_code: string | null }[];

  // Horas pico de mensajes (distribución por hora del día)
  const peakHours = db.prepare(`
    SELECT CAST(strftime('%H', datetime(created_at, 'unixepoch', '-5 hours')) AS INTEGER) as hour,
           COUNT(*) as count
    FROM messages WHERE role='user' AND created_at > unixepoch() - (30 * 86400)
    GROUP BY hour ORDER BY hour ASC
  `).all() as { hour: number; count: number }[];

  // Mensajes hoy
  const msgsToday = (db.prepare(`
    SELECT COUNT(*) as c FROM messages WHERE created_at > unixepoch() - 86400
  `).get() as { c: number }).c;

  // Tasa de respuesta del bot (% de mensajes de usuario respondidos dentro de 5 min)
  const botResponseRate = (db.prepare(`
    SELECT ROUND(100.0 * SUM(CASE WHEN r.created_at - u.created_at < 300 THEN 1 ELSE 0 END) / COUNT(*), 1) as rate
    FROM messages u
    JOIN messages r ON r.conversation_id = u.conversation_id
      AND r.role = 'assistant'
      AND r.created_at > u.created_at
      AND r.created_at = (SELECT MIN(created_at) FROM messages m WHERE m.conversation_id = u.conversation_id AND m.role='assistant' AND m.created_at > u.created_at)
    WHERE u.role = 'user' AND u.created_at > unixepoch() - (30 * 86400)
  `).get() as { rate: number | null })?.rate ?? 0;

  return NextResponse.json({
    funnel, conversionRate, totalDeals, wonDeals,
    byProduct, monthlyIncome,
    avgCloseTimeDays: Math.round(avgCloseTime),
    totalConversations, activeToday,
    totalIncome, thisMonthIncome,
    reservations, upcomingReservations,
    peakHours, msgsToday,
    botResponseRate,
  });
}
