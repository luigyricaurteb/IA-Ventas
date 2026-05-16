export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(id));
  if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const images = db.prepare(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY order_index ASC"
  ).all(Number(id));

  return NextResponse.json({ product: { ...product, images } });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const body = await req.json();

  const allowed = ["name","description","price_per_person","ai_instructions","active"];
  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  const sets = fields.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE products SET ${sets} WHERE id = ?`).run(
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
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
