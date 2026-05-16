import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const count = (db.prepare(
    "SELECT COUNT(*) as c FROM payment_proofs WHERE reviewed = 0"
  ).get() as { c: number }).c;

  const proofs = db.prepare(
    "SELECT * FROM payment_proofs WHERE reviewed = 0 ORDER BY created_at DESC"
  ).all();

  return NextResponse.json({ count, proofs });
}
