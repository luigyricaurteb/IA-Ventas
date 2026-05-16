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
  if (!file) return NextResponse.json({ error: "No se envió imagen" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `product_${productId}_${Date.now()}.${ext}`;
  const uploadDir = path.resolve(process.cwd(), "public", "uploads", "products");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), buffer);

  const existingCount = (db.prepare(
    "SELECT COUNT(*) as c FROM product_images WHERE product_id = ?"
  ).get(productId) as { c: number }).c;

  const image = db.prepare(`
    INSERT INTO product_images (product_id, filename, order_index)
    VALUES (?, ?, ?)
    RETURNING *
  `).get(productId, filename, existingCount);

  return NextResponse.json({ image }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  await params;
  const body = await req.json();
  const imageId = Number(body.imageId);
  db.prepare("DELETE FROM product_images WHERE id = ?").run(imageId);
  return NextResponse.json({ ok: true });
}
