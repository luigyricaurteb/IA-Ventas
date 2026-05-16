import { NextResponse } from "next/server";
import { listDealsWithDetails } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const deals = listDealsWithDetails();
  return NextResponse.json({ deals });
}
