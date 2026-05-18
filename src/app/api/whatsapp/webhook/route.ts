export const dynamic = "force-dynamic";
/**
 * Webhook oficial de WhatsApp Cloud API (Meta)
 * GET  → verificación del webhook por Meta
 * POST → mensajes entrantes de WhatsApp
 */
import { NextRequest, NextResponse } from "next/server";
import { getCompanyBySlug, listCompanies } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { handleMetaMessage } from "@/lib/whatsapp/meta-handler";
import type { MetaWebhookEntry } from "@/lib/whatsapp/meta-api";

// ── GET: Verificación del webhook ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "agente-dmc-webhook-2026";

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[webhook] Meta verificó el webhook correctamente");
    return new Response(challenge ?? "", { status: 200 });
  }

  console.warn("[webhook] Token de verificación incorrecto");
  return new Response("Forbidden", { status: 403 });
}

// ── POST: Mensajes entrantes ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Responder 200 inmediatamente — Meta requiere respuesta en < 5s
  const body = await req.json() as { object?: string; entry?: MetaWebhookEntry[] };

  // Ignorar si no es WhatsApp
  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  // Procesar en background para no bloquear la respuesta
  processEntries(body.entry ?? []).catch(err =>
    console.error("[webhook] Error procesando entradas:", err)
  );

  return NextResponse.json({ ok: true });
}

async function processEntries(entries: MetaWebhookEntry[]) {
  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const { metadata, messages, contacts, statuses } = change.value;
      const phoneNumberId = metadata.phone_number_id;

      // Encontrar la empresa que tiene este phone_number_id
      const company = findCompanyByPhoneId(phoneNumberId);
      if (!company) {
        console.warn(`[webhook] Empresa no encontrada para phone_number_id: ${phoneNumberId}`);
        continue;
      }

      const db = getCompanyDb(company.slug);

      // Procesar actualizaciones de estado (leídos, enviados, etc.)
      if (statuses) {
        for (const status of statuses) {
          if (status.status === "read") {
            db.prepare(
              "UPDATE messages SET read_at=? WHERE wa_message_id=? AND read_at IS NULL"
            ).run(parseInt(status.timestamp), status.id);
          }
        }
      }

      // Procesar mensajes entrantes
      if (messages) {
        for (const msg of messages) {
          const contact = contacts?.find(c => c.wa_id === msg.from);
          const pushName = contact?.profile?.name ?? undefined;
          try {
            await handleMetaMessage(db, company.slug, msg, pushName);
          } catch (e) {
            console.error(`[webhook:${company.slug}] Error procesando mensaje:`, e);
          }
        }
      }
    }
  }
}

function findCompanyByPhoneId(phoneNumberId: string) {
  const companies = listCompanies().filter(c => c.status === "active");
  for (const company of companies) {
    try {
      const db = getCompanyDb(company.slug);
      const config = db.prepare(
        "SELECT wa_phone_number_id FROM whatsapp_config WHERE id=1"
      ).get() as { wa_phone_number_id: string | null } | null;

      if (config?.wa_phone_number_id === phoneNumberId) return company;
    } catch {}
  }
  // Fallback: si solo hay una empresa, usarla
  if (companies.length === 1) return companies[0];
  return null;
}
