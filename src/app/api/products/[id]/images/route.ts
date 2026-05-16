import { NextRequest, NextResponse } from "next/server";
import { insertProductImage, deleteProductImage, getProductImages } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
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

  const existing = getProductImages(productId);
  const image = insertProductImage(productId, filename, existing.length);
  return NextResponse.json({ image }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const imageId = Number(body.imageId);
  deleteProductImage(imageId);
  return NextResponse.json({ ok: true });
}
