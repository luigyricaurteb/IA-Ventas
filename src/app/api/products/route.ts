import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import crypto from "node:crypto";
import type Database from "better-sqlite3";

export const dynamic = "force-dynamic";

function generateSlug(name: string, db: Database.Database): string {
  const base = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const suffix = crypto.randomBytes(3).toString("hex");
  const candidate = `${base}-${suffix}`;
  const exists = db.prepare("SELECT id FROM products WHERE slug=?").get(candidate);
  return exists ? `${base}-${crypto.randomBytes(4).toString("hex")}` : candidate;
}

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // Auto-assign slugs to existing products
  const missing = db.prepare("SELECT id, name FROM products WHERE slug IS NULL").all() as { id: number; name: string }[];
  for (const p of missing) {
    db.prepare("UPDATE products SET slug=? WHERE id=?").run(generateSlug(p.name, db), p.id);
  }

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

  const productSlug = generateSlug(body.name, db);

  const product = db.prepare(`
    INSERT INTO products (name, description, price_per_person, ai_instructions, active, product_type, slug)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    body.name,
    body.description ?? null,
    Number(body.price_per_person ?? 0),
    body.ai_instructions ?? null,
    body.active !== false ? 1 : 0,
    body.product_type ?? "servicio",
    productSlug,
  );

  // Assign slugs to existing products that lack one
  const missing = db.prepare("SELECT id, name FROM products WHERE slug IS NULL").all() as { id: number; name: string }[];
  for (const p of missing) {
    const s = generateSlug(p.name, db);
    db.prepare("UPDATE products SET slug=? WHERE id=?").run(s, p.id);
  }

  return NextResponse.json({ product }, { status: 201 });
}
