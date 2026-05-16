import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const alerts = db.prepare(
    "SELECT * FROM julieta_alerts WHERE resolved = 0 ORDER BY created_at DESC"
  ).all();

  const count = (db.prepare(
    "SELECT COUNT(*) as c FROM julieta_alerts WHERE resolved = 0"
  ).get() as { c: number }).c;

  return NextResponse.json({ alerts, count });
}
