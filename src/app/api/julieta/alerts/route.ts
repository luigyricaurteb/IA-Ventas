import { NextResponse } from "next/server";
import { listPendingJulietaAlerts, getPendingJulietaAlertsCount } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const alerts = listPendingJulietaAlerts();
  const count  = getPendingJulietaAlertsCount();
  return NextResponse.json({ alerts, count });
}
