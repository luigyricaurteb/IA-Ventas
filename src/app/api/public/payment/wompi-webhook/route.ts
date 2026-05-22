export const dynamic = "force-dynamic";
/**
 * Webhook de Wompi — activación automática al confirmar pago con tarjeta.
 * Wompi envía un POST a esta URL cuando cambia el estado de una transacción.
 * Docs: https://docs.wompi.co/docs/en/widget-web#events
 */
import { NextRequest, NextResponse } from "next/server";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { sendWelcomeEmail, sendPaymentConfirmedEmail } from "@/lib/master/email-master";
import crypto from "node:crypto";

interface WompiEvent {
  event: string;
  data: {
    transaction: {
      id: string;
      reference: string;
      status: string; // APPROVED | DECLINED | VOIDED | ERROR
      amount_in_cents: number;
      currency: string;
      customer_email: string;
    };
  };
  timestamp: number;
  signature: { properties: string[]; checksum: string };
}

export async function POST(req: NextRequest) {
  let body: WompiEvent;
  try { body = await req.json() as WompiEvent; }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  // Verificar firma del evento con events_key
  const gw = masterDb.prepare(
    "SELECT wompi_events_key FROM gateway_config WHERE id=1"
  ).get() as { wompi_events_key: string | null } | null;

  if (gw?.wompi_events_key) {
    const props = body.signature?.properties ?? [];
    const tx = body.data?.transaction ?? {};
    const concat = props.map(p => {
      const parts = p.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let val: any = { data: { transaction: tx } };
      for (const part of parts) val = val?.[part];
      return val ?? "";
    }).join("") + body.timestamp + gw.wompi_events_key;

    const expected = crypto.createHash("sha256").update(concat).digest("hex");
    if (expected !== body.signature?.checksum) {
      console.warn("[wompi-webhook] Firma inválida — ignorando evento");
      return NextResponse.json({ ok: false, reason: "invalid_signature" });
    }
  }

  if (body.event !== "transaction.updated") return NextResponse.json({ ok: true });

  const tx = body.data?.transaction;
  if (!tx || tx.status !== "APPROVED") return NextResponse.json({ ok: true });

  // Buscar la suscripción por la referencia de Wompi
  const sub = masterDb.prepare(
    "SELECT s.id, s.company_id, s.plan_id, c.slug, c.name, c.email FROM subscriptions s JOIN companies c ON s.company_id=c.id WHERE s.payment_reference=? AND s.status='pending'"
  ).get(tx.reference) as {
    id: number; company_id: number; plan_id: number; slug: string; name: string; email: string;
  } | null;

  if (!sub) {
    console.log(`[wompi-webhook] Referencia no encontrada: ${tx.reference}`);
    return NextResponse.json({ ok: true });
  }

  const now = Math.floor(Date.now() / 1000);
  const endsAt = now + 30 * 86400; // 30 días

  // Activar suscripción
  masterDb.prepare(
    "UPDATE subscriptions SET status='active', starts_at=?, ends_at=?, approved_at=?, payment_amount=? WHERE id=?"
  ).run(now, endsAt, now, tx.amount_in_cents / 100, sub.id);

  // Cancelar otras suscripciones pending de la misma empresa
  masterDb.prepare(
    "UPDATE subscriptions SET status='cancelled' WHERE company_id=? AND id!=? AND status='pending'"
  ).run(sub.company_id, sub.id);

  // Activar la empresa
  masterDb.prepare("UPDATE companies SET status='active', updated_at=? WHERE id=?").run(now, sub.company_id);

  // Obtener datos del admin de la empresa para incluir en el email de bienvenida
  const db = getCompanyDb(sub.slug);
  const adminUser = db.prepare("SELECT username FROM users WHERE is_admin=1 LIMIT 1").get() as { username: string } | null;
  const plan = masterDb.prepare("SELECT name FROM plans WHERE id=?").get(sub.plan_id) as { name: string } | null;

  console.log(`[wompi-webhook] ✅ Empresa ${sub.name} (${sub.slug}) activada automáticamente por pago Wompi`);

  // Email: confirmación de pago al cliente
  sendPaymentConfirmedEmail({
    to: tx.customer_email || sub.email,
    companyName: sub.name,
    plan: plan?.name ?? "Aivox",
    amount: tx.amount_in_cents / 100,
  }).catch(e => console.warn("[wompi-webhook] email pago:", (e as Error).message));

  // Email: bienvenida con credenciales (solo si tenemos el usuario admin)
  if (adminUser) {
    sendWelcomeEmail({
      to: tx.customer_email || sub.email,
      companyName: sub.name,
      username: adminUser.username,
      password: "La que registraste al crear tu cuenta",
      loginUrl: `https://aivoxgroup.com/login`,
    }).catch(e => console.warn("[wompi-webhook] email bienvenida:", (e as Error).message));
  }

  return NextResponse.json({ ok: true });
}
