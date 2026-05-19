import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const products = db.prepare("SELECT * FROM products ORDER BY created_at DESC").all() as { id: number }[];

  const withImages = products.map((p) => ({
    ...p,
    images: db.prepare(
      "SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, order_index ASC"
    ).all(p.id),
  }));

  return NextResponse.json({ products: withImages });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const product = db.prepare(`
    INSERT INTO products (name, description, price_per_person, ai_instructions, active, product_type)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    body.name,
    body.description ?? null,
    Number(body.price_per_person ?? 0),
    body.ai_instructions ?? null,
    body.active !== false ? 1 : 0,
    body.product_type ?? "servicio",
  );

  return NextResponse.json({ product }, { status: 201 });
}
