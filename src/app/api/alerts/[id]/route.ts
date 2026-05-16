import { NextRequest, NextResponse } from "next/server";
import { markProofReviewed } from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  markProofReviewed(Number(id));
  return NextResponse.json({ ok: true });
}
