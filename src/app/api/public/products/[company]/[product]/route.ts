export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";

interface Ctx { params: Promise<{ company: string; product: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { company: companySlug, product: productSlug } = await params;

  const company = masterDb.prepare(
    "SELECT id, name, slug, logo_filename FROM companies WHERE slug=? AND status='active'"
  ).get(companySlug) as { id: number; name: string; slug: string; logo_filename: string | null } | null;
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const db = getCompanyDb(companySlug);

  const product = db.prepare(
    "SELECT id, name, description, price_per_person, product_type, active, slug FROM products WHERE slug=? AND active=1"
  ).get(productSlug) as {
    id: number; name: string; description: string | null;
    price_per_person: number; product_type: string; active: number; slug: string;
  } | null;
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const images = db.prepare(
    "SELECT filename, is_main FROM product_images WHERE product_id=? ORDER BY is_main DESC, order_index ASC LIMIT 6"
  ).all(product.id) as { filename: string; is_main: number }[];

  const cfg = db.prepare(
    "SELECT name, ai_name, nequi_phone, daviplata_phone, payment_method_default FROM company_config WHERE id=1"
  ).get() as {
    name: string | null; ai_name: string | null;
    nequi_phone: string | null; daviplata_phone: string | null;
    payment_method_default: string | null;
  } | null;

  const banks = db.prepare("SELECT bank_name, account_type, account_number, account_holder FROM bank_accounts WHERE active=1").all() as {
    bank_name: string; account_type: string; account_number: string; account_holder: string | null;
  }[];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.RAILWAY_STATIC_URL
    ?? `https://disciplined-rejoicing-production-a444.up.railway.app`;

  return NextResponse.json({
    company: { name: cfg?.name ?? company.name, slug: company.slug, logo_filename: company.logo_filename },
    product: { ...product, images: images.map(i => `${appUrl}/api/uploads/products/${i.filename}`) },
    payment: {
      method: cfg?.payment_method_default ?? "bank_transfer",
      banks,
      nequi_phone: cfg?.nequi_phone ?? null,
      daviplata_phone: cfg?.daviplata_phone ?? null,
    },
    ai_name: cfg?.ai_name ?? "Julieta",
  });
}
