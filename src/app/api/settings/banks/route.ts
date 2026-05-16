import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const banks = db.prepare(
    "SELECT * FROM bank_accounts ORDER BY created_at DESC"
  ).all();

  return NextResponse.json({ banks });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.bank_name || !body.account_number) {
    return NextResponse.json({ error: "Banco y número de cuenta requeridos" }, { status: 400 });
  }

  const bank = db.prepare(`
    INSERT INTO bank_accounts (bank_name, account_type, account_number, account_holder, active)
    VALUES (?, ?, ?, ?, 1)
    RETURNING *
  `).get(
    body.bank_name,
    body.account_type    ?? "ahorros",
    body.account_number,
    body.account_holder  ?? null,
  );

  return NextResponse.json({ bank }, { status: 201 });
}
