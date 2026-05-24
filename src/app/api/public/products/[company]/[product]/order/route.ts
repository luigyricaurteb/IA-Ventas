export const dynamic = "force-dynamic";
/**
 * Crea un pedido desde la página pública del producto.
 * Soporta: transferencia bancaria (con comprobante) o sin pago adelantado.
 */
import { NextRequest, NextResponse } from "next/server";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

interface Ctx { params: Promise<{ company: string; product: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { company: companySlug, product: productSlug } = await params;

  const company = masterDb.prepare(
    "SELECT id, name FROM companies WHERE slug=? AND status='active'"
  ).get(companySlug) as { id: number; name: string } | null;
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const db = getCompanyDb(companySlug);

  const product = db.prepare(
    "SELECT id, name, price_per_person FROM products WHERE slug=? AND active=1"
  ).get(productSlug) as { id: number; name: string; price_per_person: number } | null;
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const formData = await req.formData();
  const clientName  = String(formData.get("name") ?? "").trim();
  const clientPhone = String(formData.get("phone") ?? "").trim().replace(/\D/g, "");
  const people      = Math.max(1, parseInt(String(formData.get("people") ?? "1")));
  const proof       = formData.get("proof") as File | null;
  const notes       = String(formData.get("notes") ?? "").trim();

  if (!clientName || !clientPhone) {
    return NextResponse.json({ error: "Nombre y teléfono son requeridos" }, { status: 400 });
  }

  const total = product.price_per_person * people;

  // Crear / obtener conversación por teléfono
  const phone = clientPhone.startsWith("57") ? clientPhone : `57${clientPhone}`;
  let conv = db.prepare("SELECT id FROM conversations WHERE phone=?").get(phone) as { id: number } | null;
  if (!conv) {
    conv = db.prepare(
      "INSERT INTO conversations (phone, name) VALUES (?,?) RETURNING id"
    ).get(phone, clientName) as { id: number };
  } else {
    if (clientName) db.prepare("UPDATE conversations SET name=? WHERE id=? AND (name IS NULL OR name='')")
      .run(clientName, conv.id);
  }
  const convId = conv.id;

  // Crear / actualizar contacto
  let contact = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(convId) as { id: number } | null;
  if (!contact) {
    contact = db.prepare(
      "INSERT INTO contacts (conversation_id, full_name, phone, people_count) VALUES (?,?,?,?) RETURNING id"
    ).get(convId, clientName, phone, people) as { id: number };
  }

  // Crear deal
  const deal = db.prepare(
    "INSERT INTO crm_deals (conversation_id, contact_id, stage, product_id, people_count, total_value, notes) VALUES (?,?,?,?,?,?,?) RETURNING id"
  ).get(convId, contact.id, "PROPUESTA", product.id, people, total, notes || null) as { id: number };

  let proofFilename: string | null = null;
  if (proof && ALLOWED_TYPES.has(proof.type)) {
    const ext = proof.type === "application/pdf" ? "pdf" : proof.type.split("/")[1];
    proofFilename = `proof_${companySlug}_${Date.now()}.${ext}`;
    const dir = path.join(DATA_DIR, "uploads", "proofs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const bytes = await proof.arrayBuffer();
    fs.writeFileSync(path.join(dir, proofFilename), Buffer.from(bytes));

    db.prepare(
      "INSERT INTO payment_proofs (conversation_id, deal_id, filename, mimetype) VALUES (?,?,?,?)"
    ).run(convId, deal.id, proofFilename, proof.type);

    db.prepare("UPDATE crm_deals SET stage='NEGOCIACION' WHERE id=?").run(deal.id);
  }

  // Mensaje automático en la conversación
  const orderMsg = `📦 *Pedido desde link de producto*\n\n` +
    `Cliente: ${clientName}\nProducto: ${product.name}\nPersonas: ${people}\nTotal: $${total.toLocaleString("es-CO")} COP` +
    (proofFilename ? `\n\n✅ Comprobante de pago adjunto.` : `\n\n⏳ Pendiente de pago.`);
  db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(convId, "user", orderMsg);

  // Alerta de Julieta para notificar al asesor
  db.prepare(
    "INSERT INTO julieta_alerts (conversation_id, question, julieta_response) VALUES (?,?,?)"
  ).run(convId, `Nuevo pedido web: ${product.name} x${people} personas`, orderMsg);

  return NextResponse.json({ ok: true, deal_id: deal.id, total, phone });
}
