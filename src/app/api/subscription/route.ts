export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getCompanyBySlug, listSubscriptions, getPlanById } from "@/lib/master/db-master";

export async function GET(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const slug = (me.company as string) ?? "platform";
  const company = getCompanyBySlug(slug);
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const subs = listSubscriptions(company.id);
  const active = subs.find(s => s.status === "active") ?? null;
  const plan = active?.plan_id ? getPlanById(active.plan_id) : (company.plan_id ? getPlanById(company.plan_id) : null);

  const now = Math.floor(Date.now() / 1000);
  const daysLeft = active?.ends_at ? Math.max(0, Math.ceil((active.ends_at - now) / 86400)) : null;
  const isPermanent = active?.billing_cycle === "permanent" || plan?.billing_cycle === "permanent";

  return NextResponse.json({
    company: { id: company.id, slug: company.slug, name: company.name, status: company.status },
    plan: plan ? {
      id: plan.id, name: plan.name, description: plan.description,
      price_monthly: plan.price_monthly, billing_cycle: plan.billing_cycle,
      modules: JSON.parse(plan.modules || "{}") as Record<string, boolean>,
      max_users: plan.max_users, max_wa_numbers: plan.max_wa_numbers,
    } : null,
    subscription: active ? {
      id: active.id, status: active.status,
      starts_at: active.starts_at, ends_at: active.ends_at,
      billing_cycle: active.billing_cycle, payment_amount: active.payment_amount,
    } : null,
    daysLeft,
    isPermanent,
    allSubscriptions: subs.slice(0, 10),
  });
}
