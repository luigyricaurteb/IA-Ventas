import { NextRequest, NextResponse } from "next/server";
import { deleteBankAccount } from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  deleteBankAccount(Number(id));
  return NextResponse.json({ ok: true });
}
