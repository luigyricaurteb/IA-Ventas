import { NextRequest, NextResponse } from "next/server";
import { updateLegalDocument } from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  updateLegalDocument(Number(id), body);
  return NextResponse.json({ ok: true });
}
