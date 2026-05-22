export const dynamic = "force-dynamic";
/**
 * Subida de comprobante de transferencia bancaria.
 * El cliente sube su comprobante, se notifica al master por email.
 */
import { NextRequest, NextResponse } from "next/server";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { sendPaymentProofNotification } from "@/lib/master/email-master";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const slug     = formData.get("slug") as string | null;
  const proof    = formData.get("proof") as File | null;
  const amount   = parseFloat(String(formData.get("amount") ?? "0"));

  if (!slug || !proof) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(proof.type)) {
    return NextResponse.json({ error: "Solo se aceptan imágenes (JPG, PNG, WebP) o PDF" }, { status: 400 });
  }
  if (proof.size > MAX_SIZE) {
    return NextResponse.json({ error: "El archivo no debe superar 10 MB" }, { status: 400 });
  }

  const company = masterDb.prepare("SELECT id, name, email, plan_id FROM companies WHERE slug=?").get(slug) as {
    id: number; name: string; email: string; plan_id: number | null;
  } | null;
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  // Guardar archivo
  const ext = proof.type === "application/pdf" ? "pdf" : proof.type.split("/")[1];
  const filename = `proof_${slug}_${Date.now()}.${ext}`;
  const proofDir = path.join(DATA_DIR, "uploads", "proofs");
  if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
  const bytes = await proof.arrayBuffer();
  fs.writeFileSync(path.join(proofDir, filename), Buffer.from(bytes));

  // Actualizar suscripción con el comprobante
  const sub = masterDb.prepare(
    "SELECT id FROM subscriptions WHERE company_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1"
  ).get(company.id) as { id: number } | null;

  if (sub) {
    masterDb.prepare(
      "UPDATE subscriptions SET payment_proof_file=?, payment_amount=? WHERE id=?"
    ).run(filename, amount || null, sub.id);
  }

  // Obtener nombre del plan
  const plan = company.plan_id
    ? masterDb.prepare("SELECT name FROM plans WHERE id=?").get(company.plan_id) as { name: string } | null
    : null;

  // Email de notificación al master
  const platformDb = getCompanyDb("platform");
  const masterEmail = platformDb.prepare("SELECT email FROM company_config WHERE id=1").get() as { email: string | null } | null;

  if (masterEmail?.email) {
    const activateUrl = `https://aivoxgroup.com/dashboard`;
    sendPaymentProofNotification({
      masterEmail: masterEmail.email,
      companyName: company.name,
      slug,
      plan: plan?.name ?? "—",
      amount: amount || 0,
      proofUrl: `https://aivoxgroup.com/api/uploads/proofs/${filename}`,
      activateUrl,
    }).catch(e => console.warn("[proof] email master:", (e as Error).message));
  }

  return NextResponse.json({ ok: true });
}
