import { NextRequest, NextResponse } from "next/server";
import { listSuppliers, insertSupplier } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ suppliers: listSuppliers() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const supplier = insertSupplier({
    name: body.name, nit: body.nit ?? null, email: body.email ?? null,
    phone: body.phone ?? null, contact_person: body.contact_person ?? null,
    rnt: body.rnt ?? null, active: 1,
  });
  return NextResponse.json({ supplier }, { status: 201 });
}
