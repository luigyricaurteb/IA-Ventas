import { NextRequest, NextResponse } from "next/server";
import { getProductById, updateProduct, deleteProduct, getProductImages } from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const product = getProductById(Number(id));
  if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const images = getProductImages(Number(id));
  return NextResponse.json({ product: { ...product, images } });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  updateProduct(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  deleteProduct(Number(id));
  return NextResponse.json({ ok: true });
}
