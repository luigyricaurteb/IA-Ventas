import { NextResponse } from "next/server";
import { getPendingProofsCount, listPendingProofs } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const count  = getPendingProofsCount();
  const proofs = listPendingProofs();
  return NextResponse.json({ count, proofs });
}
