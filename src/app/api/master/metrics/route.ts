export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import masterDb, { listCompanies } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || me.role !== "master") return NextResponse.json({ error: "Solo master" }, { status: 403 });

  const now = Math.floor(Date.now() / 1000);
  const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
  const lastMonthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime() / 1000);

  const companies = listCompanies();
  const active = companies.filter(c => c.status === "active");
  const suspended = companies.filter(c => c.status === "suspended");
  const trial = companies.filter(c => c.status === "trial");
  const pending = companies.filter(c => c.status === "pending");

  // New this month
  const newThisMonth = companies.filter(c => c.created_at >= monthStart).length;
  const newLastMonth = companies.filter(c => c.created_at >= lastMonthStart && c.created_at < monthStart).length;

  // MRR from active subscriptions
  const activeSubs = masterDb.prepare(`
    SELECT s.payment_amount, s.billing_cycle, p.price_monthly, p.price_usd
    FROM subscriptions s
    LEFT JOIN plans p ON s.plan_id = p.id
    WHERE s.status = 'active'
  `).all() as { payment_amount: number | null; billing_cycle: string; price_monthly: number; price_usd: number }[];

  let mrrCOP = 0;
  let mrrUSD = 0;
  for (const sub of activeSubs) {
    const amt = sub.payment_amount ?? sub.price_monthly ?? 0;
    if (sub.billing_cycle === "yearly") {
      mrrCOP += amt / 12;
    } else if (sub.billing_cycle === "permanent") {
      // Amortize over 24 months
      mrrCOP += amt / 24;
    } else {
      mrrCOP += amt;
    }
    mrrUSD += (sub.price_usd ?? 0);
  }

  // Churn: companies suspended this month
  const churnThisMonth = masterDb.prepare(
    "SELECT COUNT(*) as c FROM companies WHERE status='suspended' AND updated_at >= ?",
  ).get(monthStart) as { c: number };

  // ARR
  const arrCOP = mrrCOP * 12;

  // Revenue per company (from subscriptions paid this month)
  const revenuePerPlan = masterDb.prepare(`
    SELECT p.name, p.price_monthly, COUNT(s.id) as subscribers
    FROM plans p
    LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
    WHERE p.active = 1
    GROUP BY p.id
    ORDER BY p.price_monthly DESC
  `).all() as { name: string; price_monthly: number; subscribers: number }[];

  // Tickets stats
  const openTickets = (masterDb.prepare("SELECT COUNT(*) as c FROM support_tickets WHERE status='open'").get() as { c: number }).c;
  const resolvedThisMonth = (masterDb.prepare("SELECT COUNT(*) as c FROM support_tickets WHERE status='resolved' AND updated_at >= ?").get(monthStart) as { c: number }).c;

  // Per-company revenue (top 5 by subscription amount)
  const topCompanies = masterDb.prepare(`
    SELECT c.name, c.slug, c.status, p.name as plan_name, p.price_monthly,
           s.payment_amount, s.ends_at
    FROM companies c
    LEFT JOIN plans p ON c.plan_id = p.id
    LEFT JOIN subscriptions s ON s.company_id = c.id AND s.status = 'active'
    WHERE c.status = 'active'
    ORDER BY COALESCE(s.payment_amount, p.price_monthly, 0) DESC
    LIMIT 10
  `).all() as { name: string; slug: string; status: string; plan_name: string | null; price_monthly: number | null; payment_amount: number | null; ends_at: number | null }[];

  // Conversation stats per company (approximate activity)
  const companyActivity = [];
  for (const c of active.slice(0, 5)) {
    try {
      const db = getCompanyDb(c.slug);
      const convCount = (db.prepare("SELECT COUNT(*) as c FROM conversations").get() as { c: number }).c;
      const msgThisMonth = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE created_at >= ?").get(monthStart) as { c: number }).c;
      companyActivity.push({ name: c.name, slug: c.slug, conversations: convCount, messagesThisMonth: msgThisMonth });
    } catch {}
  }

  return NextResponse.json({
    summary: {
      total: companies.length,
      active: active.length,
      suspended: suspended.length,
      trial: trial.length,
      pending: pending.length,
      newThisMonth,
      newLastMonth,
      churnThisMonth: churnThisMonth.c,
      openTickets,
      resolvedThisMonth,
    },
    mrr: {
      cop: Math.round(mrrCOP),
      usd: Math.round(mrrUSD),
      arr: Math.round(arrCOP),
    },
    revenuePerPlan,
    topCompanies,
    companyActivity,
    generatedAt: now,
  });
}
