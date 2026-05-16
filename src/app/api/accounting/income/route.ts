import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const income = db.prepare(
    "SELECT * FROM accounting_income ORDER BY income_date DESC"
  ).all();

  return NextResponse.json({ income });
}
