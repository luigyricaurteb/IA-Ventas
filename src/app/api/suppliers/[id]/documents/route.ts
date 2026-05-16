export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

interface Ctx { params: Promise<{ id: string }> }

const DOCS_DIR = path.resolve(process.cwd(), "public", "uploads", "supplier-docs");

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const supplierId = Number(id);

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const docType = (formData.get("doc_type") as string) ?? "otro";
    if (!file) return NextResponse.json({ error: "No se envió archivo" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const ext = file.name.split(".").pop() ?? "pdf";
    const filename = `supplier_${supplierId}_${docType}_${Date.now()}.${ext}`;
    if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(path.join(DOCS_DIR, filename), Buffer.from(bytes));

    const doc = db.prepare(`
      INSERT INTO supplier_documents (supplier_id, doc_type, filename, original_name)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `).get(supplierId, docType, filename, file.name);

    return NextResponse.json({ document: doc }, { status: 201 });
  }

  // JSON: agregar cuenta bancaria
  const body = await req.json();
  if (body.bank_name) {
    const bank = db.prepare(`
      INSERT INTO supplier_bank_accounts (supplier_id, bank_name, account_type, account_number, account_holder)
      VALUES (?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      supplierId,
      body.bank_name,
      body.account_type    ?? "ahorros",
      body.account_number,
      body.account_holder  ?? null,
    );
    return NextResponse.json({ bank }, { status: 201 });
  }

  return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  await params;
  const body = await req.json();
  if (body.bank_id) {
    db.prepare("DELETE FROM supplier_bank_accounts WHERE id = ?").run(Number(body.bank_id));
    return NextResponse.json({ ok: true });
  }
  if (body.doc_id) {
    db.prepare("DELETE FROM supplier_documents WHERE id = ?").run(Number(body.doc_id));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "ID requerido" }, { status: 400 });
}
