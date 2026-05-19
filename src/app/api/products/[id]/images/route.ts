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
  const productId = Number(id);
  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  const isMain = formData.get("is_main") === "1";

  if (!file) return NextResponse.json({ error: "No se envió imagen" }, { status: 400 });

  // Enforce limits: max 1 main + 3 additional
  const counts = db.prepare(
    "SELECT SUM(is_main) as mains, SUM(1-is_main) as extras FROM product_images WHERE product_id=?"
  ).get(productId) as { mains: number; extras: number } | null;

  if (isMain && (counts?.mains ?? 0) >= 1) {
    // Replace existing main
    const old = db.prepare("SELECT id, filename FROM product_images WHERE product_id=? AND is_main=1 LIMIT 1").get(productId) as { id: number; filename: string } | null;
    if (old) {
      db.prepare("DELETE FROM product_images WHERE id=?").run(old.id);
      tryDeleteFile(old.filename);
    }
  }
  if (!isMain && (counts?.extras ?? 0) >= 3) {
    return NextResponse.json({ error: "Máximo 3 fotos adicionales" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `product_${productId}_${Date.now()}.${ext}`;
  const uploadDir = path.resolve(process.cwd(), "public", "uploads", "products");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), buffer);

  const existingCount = (db.prepare("SELECT COUNT(*) as c FROM product_images WHERE product_id=?").get(productId) as { c: number }).c;
  const image = db.prepare(
    "INSERT INTO product_images (product_id, filename, order_index, is_main) VALUES (?,?,?,?) RETURNING *"
  ).get(productId, filename, isMain ? 0 : existingCount, isMain ? 1 : 0);

  return NextResponse.json({ image }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  await params;

  const body = await req.json() as { imageId: number };
  const img = db.prepare("SELECT filename FROM product_images WHERE id=?").get(body.imageId) as { filename: string } | null;
  if (img) tryDeleteFile(img.filename);
  db.prepare("DELETE FROM product_images WHERE id=?").run(body.imageId);
  return NextResponse.json({ ok: true });
}

function tryDeleteFile(filename: string) {
  const uploadDir = path.resolve(process.cwd(), "public", "uploads", "products");
  try { fs.unlinkSync(path.join(uploadDir, filename)); } catch {}
}
