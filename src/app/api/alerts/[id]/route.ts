export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  db.prepare(
    "UPDATE payment_proofs SET reviewed = 1, reviewed_at = unixepoch() WHERE id = ?"
  ).run(Number(id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const proof = db.prepare("SELECT filename FROM payment_proofs WHERE id=?").get(Number(id)) as { filename: string } | null;

  // Eliminar archivo físico
  if (proof?.filename) {
    const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
    const candidates = [
      path.join(DATA_DIR, "uploads", "proofs", proof.filename),
      path.join(process.cwd(), "public", "uploads", "proofs", proof.filename),
    ];
    for (const p of candidates) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
  }

  // Eliminar registro y también limpiar el mensaje del chat
  if (proof?.filename) {
    db.prepare("DELETE FROM messages WHERE content LIKE ?").run(`%${proof.filename}%`);
  }
  db.prepare("DELETE FROM payment_proofs WHERE id=?").run(Number(id));

  return NextResponse.json({ ok: true });
}
