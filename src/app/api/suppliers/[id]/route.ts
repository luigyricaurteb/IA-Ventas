import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(id));
  if (!supplier) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const banks = db.prepare(
    "SELECT * FROM supplier_bank_accounts WHERE supplier_id = ?"
  ).all(Number(id));

  const documents = db.prepare(
    "SELECT * FROM supplier_documents WHERE supplier_id = ?"
  ).all(Number(id));

  return NextResponse.json({ supplier, banks, documents });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const body = await req.json();

  const allowed = ["name","nit","email","phone","contact_person","rnt","active"];
  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  const sets = fields.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE suppliers SET ${sets} WHERE id = ?`).run(
    ...fields.map((f) => body[f]),
    Number(id),
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  db.prepare("DELETE FROM suppliers WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
