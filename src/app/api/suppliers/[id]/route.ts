import { NextRequest, NextResponse } from "next/server";
import {
  getSupplierById, updateSupplier, deleteSupplier,
  listSupplierBankAccounts, listSupplierDocuments,
  insertSupplierBankAccount, deleteSupplierBankAccount,
} from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supplier = getSupplierById(Number(id));
  if (!supplier) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const banks = listSupplierBankAccounts(Number(id));
  const documents = listSupplierDocuments(Number(id));
  return NextResponse.json({ supplier, banks, documents });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  updateSupplier(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  deleteSupplier(Number(id));
  return NextResponse.json({ ok: true });
}
