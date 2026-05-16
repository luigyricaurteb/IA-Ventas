import { NextRequest, NextResponse } from "next/server";
import { listProducts, insertProduct, getProductImages } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = listProducts();
  const withImages = products.map((p) => ({
    ...p,
    images: getProductImages(p.id),
  }));
  return NextResponse.json({ products: withImages });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const product = insertProduct({
    name: body.name,
    description: body.description ?? null,
    price_per_person: Number(body.price_per_person ?? 0),
    ai_instructions: body.ai_instructions ?? null,
    active: body.active !== false ? 1 : 0,
  });
  return NextResponse.json({ product }, { status: 201 });
}
