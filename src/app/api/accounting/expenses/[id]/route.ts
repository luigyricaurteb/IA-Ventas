import { NextRequest, NextResponse } from "next/server";
import { deleteExpense } from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  deleteExpense(Number(id));
  return NextResponse.json({ ok: true });
}
