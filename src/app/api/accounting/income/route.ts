import { NextResponse } from "next/server";
import { listIncome } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const income = listIncome();
  return NextResponse.json({ income });
}
