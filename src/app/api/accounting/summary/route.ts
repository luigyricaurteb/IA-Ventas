import { NextRequest, NextResponse } from "next/server";
import { getAccountingSummary } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now   = Math.floor(Date.now() / 1000);
  const start = Number(searchParams.get("start") ?? now - 30 * 86400);
  const end   = Number(searchParams.get("end")   ?? now);
  const summary = getAccountingSummary(start, end);
  return NextResponse.json({ summary, start, end });
}
