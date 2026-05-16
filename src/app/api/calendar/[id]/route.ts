import { NextRequest, NextResponse } from "next/server";
import { updateReservation, deleteReservation } from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  updateReservation(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  deleteReservation(Number(id));
  return NextResponse.json({ ok: true });
}
