import { NextRequest, NextResponse } from "next/server";
import { listBankAccounts, insertBankAccount } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ banks: listBankAccounts() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.bank_name || !body.account_number) {
    return NextResponse.json({ error: "Banco y número de cuenta requeridos" }, { status: 400 });
  }
  const bank = insertBankAccount({
    bank_name: body.bank_name,
    account_type: body.account_type ?? "ahorros",
    account_number: body.account_number,
    account_holder: body.account_holder ?? null,
    active: 1,
  });
  return NextResponse.json({ bank }, { status: 201 });
}
