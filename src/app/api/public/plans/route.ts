export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listPlans } from "@/lib/master/db-master";

export async function GET() {
  const plans = listPlans().filter(p => p.active);
  return NextResponse.json({ plans: plans.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price_cop: p.price_monthly,
    price_usd: p.price_usd ?? 0,
    billing_cycle: p.billing_cycle,
    max_users: p.max_users,
    max_wa_numbers: p.max_wa_numbers ?? 1,
    modules: (() => { try { return JSON.parse(p.modules || "{}"); } catch { return {}; } })(),
  }))});
}
