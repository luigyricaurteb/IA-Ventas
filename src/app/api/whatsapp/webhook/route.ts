export const dynamic = "force-dynamic";
/**
 * Webhook unificado — WhatsApp Cloud API + Facebook Messenger + Instagram DMs
 * GET  → verificación del webhook por Meta
 * POST → mensajes entrantes de cualquier canal
 */
import { NextRequest, NextResponse } from "next/server";
import { getCompanyBySlug, listCompanies } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { handleMetaMessage } from "@/lib/whatsapp/meta-handler";
import type { MetaWebhookEntry, MetaMessage } from "@/lib/whatsapp/meta-api";

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "agente-dmc-webhook-2026";

// ── GET: Verificación ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[webhook] Verificación exitosa");
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST: Mensajes entrantes ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    object?: string;
    entry?: MetaWebhookEntry[] | FacebookEntry[];
  };

  // Procesar en background para responder en < 5s (requisito de Meta)
  processWebhook(body).catch(err =>
    console.error("[webhook] Error procesando:", err)
  );

  return NextResponse.json({ ok: true });
}

async function processWebhook(body: { object?: string; entry?: unknown[] }) {
  const { object, entry } = body;

  switch (object) {
    case "whatsapp_business_account":
      await processWhatsApp(entry as MetaWebhookEntry[]);
      break;
    case "page":
      await processFacebook(entry as FacebookEntry[]);
      break;
    case "instagram":
      await processInstagram(entry as InstagramEntry[]);
      break;
  }
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────
async function processWhatsApp(entries: MetaWebhookEntry[]) {
  for (const entry of entries ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const { metadata, messages, contacts, statuses } = change.value;

      const company = findCompanyByPhoneId(metadata.phone_number_id);
      if (!company) continue;
      const db = getCompanyDb(company.slug);

      if (statuses) {
        for (const s of statuses) {
          if (s.status === "read") {
            db.prepare("UPDATE messages SET read_at=? WHERE wa_message_id=? AND read_at IS NULL")
              .run(parseInt(s.timestamp), s.id);
          }
        }
      }

      if (messages) {
        for (const msg of messages) {
          const contact = contacts?.find(c => c.wa_id === msg.from);
          await handleMetaMessage(db, company.slug, msg, contact?.profile?.name);
        }
      }
    }
  }
}

// ── Facebook Messenger ────────────────────────────────────────────────────────
async function processFacebook(entries: FacebookEntry[]) {
  for (const entry of entries ?? []) {
    const pageId = entry.id;
    const company = findCompanyByPageId(pageId) ?? getDefaultCompany();
    if (!company) continue;
    const db = getCompanyDb(company.slug);

    for (const event of entry.messaging ?? []) {
      if (!event.message || event.message.is_echo) continue;

      const senderId  = event.sender.id;
      const text      = event.message.text ?? null;
      const messageId = event.message.mid;

      if (!text) continue;

      // Deduplicar
      const exists = db.prepare("SELECT id FROM messages WHERE wa_message_id=? LIMIT 1").get(messageId);
      if (exists) continue;

      // Obtener nombre del remitente desde Facebook Graph API si es posible
      const senderName = await getFacebookUserName(senderId, db);

      // Crear o actualizar conversación
      let conv = db.prepare(
        "SELECT id, mode, name FROM conversations WHERE channel='facebook' AND channel_user_id=?"
      ).get(senderId) as { id: number; mode: string; name: string | null } | null;

      if (!conv) {
        conv = db.prepare(
          "INSERT INTO conversations (phone, name, channel, channel_user_id, channel_page_id) VALUES (?,?,?,?,?) RETURNING id, mode, name"
        ).get(`fb_${senderId}`, senderName, "facebook", senderId, pageId) as typeof conv;
      }
      if (!conv) continue;

      console.log(`[webhook:facebook] ← ${senderId} (${senderName ?? "sin nombre"}): "${text.slice(0, 80)}"`);

      db.prepare("INSERT INTO messages (conversation_id, role, content, wa_message_id) VALUES (?,?,?,?)")
        .run(conv.id, "user", text, messageId);
      db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);

      // Procesar con el bot (mismo flujo que WhatsApp)
      if (conv.mode === "AI") {
        const history = db.prepare(
          "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 30"
        ).all(conv.id) as { role: string; content: string }[];

        const { sendOmniMessage } = await import("@/lib/whatsapp/omni-channel");
        const { processBotMessage } = await import("@/lib/bot/state-machine");

        const fbSock = {
          sendMessage: async (_jid: string, content: { text?: string }) => {
            if (content.text) await sendOmniMessage(db, "facebook", senderId, content.text);
          },
          user: { id: `fb_${senderId}` },
          ev: { emit: () => {}, on: () => {}, off: () => {} },
        };

        await processBotMessage(fbSock as never, conv.id, `fb_${senderId}`, `fb_${senderId}`, text, history, company.slug, senderName ?? undefined);
      }
    }
  }
}

// ── Instagram ────────────────────────────────────────────────────────────────
async function processInstagram(entries: InstagramEntry[]) {
  for (const entry of entries ?? []) {
    const igAccountId = entry.id;
    const company = findCompanyByIgId(igAccountId) ?? getDefaultCompany();
    if (!company) continue;
    const db = getCompanyDb(company.slug);

    for (const event of entry.messaging ?? []) {
      if (!event.message || event.message.is_echo) continue;

      const senderId  = event.sender.id;
      const text      = event.message.text ?? null;
      const messageId = event.message.mid;

      if (!text) continue;

      const exists = db.prepare("SELECT id FROM messages WHERE wa_message_id=? LIMIT 1").get(messageId);
      if (exists) continue;

      let conv = db.prepare(
        "SELECT id, mode, name FROM conversations WHERE channel='instagram' AND channel_user_id=?"
      ).get(senderId) as { id: number; mode: string; name: string | null } | null;

      if (!conv) {
        conv = db.prepare(
          "INSERT INTO conversations (phone, name, channel, channel_user_id, channel_page_id) VALUES (?,?,?,?,?) RETURNING id, mode, name"
        ).get(`ig_${senderId}`, null, "instagram", senderId, igAccountId) as typeof conv;
      }
      if (!conv) continue;

      console.log(`[webhook:instagram] ← ${senderId}: "${text.slice(0, 80)}"`);

      db.prepare("INSERT INTO messages (conversation_id, role, content, wa_message_id) VALUES (?,?,?,?)")
        .run(conv.id, "user", text, messageId);
      db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);

      if (conv.mode === "AI") {
        const history = db.prepare(
          "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 30"
        ).all(conv.id) as { role: string; content: string }[];

        const { sendOmniMessage } = await import("@/lib/whatsapp/omni-channel");
        const { processBotMessage } = await import("@/lib/bot/state-machine");

        const igSock = {
          sendMessage: async (_jid: string, content: { text?: string }) => {
            if (content.text) await sendOmniMessage(db, "instagram", senderId, content.text);
          },
          user: { id: `ig_${senderId}` },
          ev: { emit: () => {}, on: () => {}, off: () => {} },
        };

        await processBotMessage(igSock as never, conv.id, `ig_${senderId}`, `ig_${senderId}`, text, history, company.slug);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function findCompanyByPhoneId(phoneNumberId: string) {
  const companies = listCompanies().filter(c => c.status === "active");
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  for (const company of companies) {
    try {
      const db = getCompanyDb(company.slug);
      const cfg = db.prepare("SELECT wa_phone_number_id FROM whatsapp_config WHERE id=1").get() as { wa_phone_number_id: string | null } | null;
      const phoneId = cfg?.wa_phone_number_id || envPhoneId;
      if (phoneId === phoneNumberId) return company;
    } catch {}
  }
  if (companies.length === 1) return companies[0];
  return null;
}

function findCompanyByPageId(pageId: string) {
  const companies = listCompanies().filter(c => c.status === "active");
  for (const company of companies) {
    try {
      const db = getCompanyDb(company.slug);
      const cfg = db.prepare("SELECT fb_page_id FROM whatsapp_config WHERE id=1").get() as { fb_page_id: string | null } | null;
      if (cfg?.fb_page_id === pageId) return company;
    } catch {}
  }
  return null;
}

function findCompanyByIgId(igId: string) {
  const companies = listCompanies().filter(c => c.status === "active");
  for (const company of companies) {
    try {
      const db = getCompanyDb(company.slug);
      const cfg = db.prepare("SELECT ig_account_id FROM whatsapp_config WHERE id=1").get() as { ig_account_id: string | null } | null;
      if (cfg?.ig_account_id === igId) return company;
    } catch {}
  }
  return null;
}

function getDefaultCompany() {
  const companies = listCompanies().filter(c => c.status === "active");
  return companies.length === 1 ? companies[0] : null;
}

async function getFacebookUserName(userId: string, db: import("better-sqlite3").Database): Promise<string | null> {
  try {
    const cfg = db.prepare("SELECT fb_page_token FROM whatsapp_config WHERE id=1").get() as { fb_page_token: string | null } | null;
    const token = cfg?.fb_page_token ?? process.env.FB_PAGE_TOKEN;
    if (!token) return null;
    const res = await fetch(`https://graph.facebook.com/v21.0/${userId}?fields=name&access_token=${token}`, { signal: AbortSignal.timeout(5000) });
    const d = await res.json() as { name?: string };
    return d.name ?? null;
  } catch { return null; }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface FacebookEntry {
  id: string;
  messaging: Array<{
    sender: { id: string };
    recipient: { id: string };
    message?: { mid: string; text?: string; is_echo?: boolean };
  }>;
}

interface InstagramEntry {
  id: string;
  messaging: Array<{
    sender: { id: string };
    recipient: { id: string };
    message?: { mid: string; text?: string; is_echo?: boolean };
  }>;
}
