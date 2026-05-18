/**
 * WhatsApp Cloud API — Meta oficial
 * Reemplaza Baileys. Sin WebSocket, sin QR, sin proceso background.
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const BASE_URL = "https://graph.facebook.com/v21.0";

function getConfig(companyDb: import("better-sqlite3").Database) {
  const row = companyDb.prepare(
    "SELECT wa_access_token, wa_phone_number_id FROM whatsapp_config WHERE id=1"
  ).get() as { wa_access_token: string | null; wa_phone_number_id: string | null } | null;

  // Las variables de entorno de Railway tienen prioridad sobre la DB
  // Así las credenciales persisten aunque la DB se resetee en un redeploy
  const token   = process.env.WHATSAPP_ACCESS_TOKEN   || row?.wa_access_token   || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || row?.wa_phone_number_id || "";

  if (!token || !phoneId) throw new Error("WhatsApp Cloud API no configurado. Agrega WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en Railway.");
  return { token, phoneId };
}

// ── Enviar mensaje de texto ───────────────────────────────────────────────────
export async function sendText(
  companyDb: import("better-sqlite3").Database,
  to: string,
  text: string
): Promise<void> {
  const { token, phoneId } = getConfig(companyDb);
  const phone = to.replace(/\D/g, "");

  const res = await fetch(`${BASE_URL}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { body: text, preview_url: false },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error ${res.status}: ${err}`);
  }
}

// ── Enviar imagen ─────────────────────────────────────────────────────────────
export async function sendImage(
  companyDb: import("better-sqlite3").Database,
  to: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  const { token, phoneId } = getConfig(companyDb);
  const phone = to.replace(/\D/g, "");

  await fetch(`${BASE_URL}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "image",
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    }),
    signal: AbortSignal.timeout(15000),
  });
}

// ── Enviar documento ──────────────────────────────────────────────────────────
export async function sendDocument(
  companyDb: import("better-sqlite3").Database,
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
): Promise<void> {
  const { token, phoneId } = getConfig(companyDb);
  const phone = to.replace(/\D/g, "");

  await fetch(`${BASE_URL}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "document",
      document: { link: documentUrl, filename, ...(caption ? { caption } : {}) },
    }),
    signal: AbortSignal.timeout(15000),
  });
}

// ── Marcar mensaje como leído ─────────────────────────────────────────────────
export async function markAsRead(
  companyDb: import("better-sqlite3").Database,
  messageId: string
): Promise<void> {
  try {
    const { token, phoneId } = getConfig(companyDb);
    await fetch(`${BASE_URL}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

// ── Verificar conexión con Meta ───────────────────────────────────────────────
export async function verifyConnection(
  token: string,
  phoneNumberId: string
): Promise<{ ok: boolean; phone?: string; name?: string; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: { message?: string } };
      return { ok: false, error: d.error?.message ?? `Error ${res.status}` };
    }
    const d = await res.json() as { display_phone_number?: string; verified_name?: string };
    return { ok: true, phone: d.display_phone_number, name: d.verified_name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Tipos de mensajes entrantes de Meta ──────────────────────────────────────
export interface MetaMessage {
  id: string;
  from: string;         // número del remitente (sin +)
  timestamp: string;
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contacts" | "interactive" | "button" | "order" | "unsupported";
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  button?: { text: string; payload: string };
}

export interface MetaContact {
  profile: { name: string };
  wa_id: string;
}

export interface MetaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: "whatsapp";
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: MetaContact[];
      messages?: MetaMessage[];
      statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id: string }>;
    };
    field: string;
  }>;
}

// ── Extraer texto de un mensaje entrante ─────────────────────────────────────
export function extractText(msg: MetaMessage): string | null {
  if (msg.type === "text" && msg.text?.body)  return msg.text.body;
  if (msg.type === "interactive") {
    return msg.interactive?.button_reply?.title
        ?? msg.interactive?.list_reply?.title
        ?? null;
  }
  if (msg.type === "button") return msg.button?.text ?? null;
  if (msg.type === "image")    return msg.image?.caption    ? `📷 ${msg.image.caption}`    : "📷 [Imagen]";
  if (msg.type === "video")    return msg.video?.caption    ? `🎬 ${msg.video.caption}`    : "🎬 [Video]";
  if (msg.type === "audio")    return msg.audio?.voice      ? "🎤 [Nota de voz]"           : "🎵 [Audio]";
  if (msg.type === "document") return msg.document?.caption ? `📎 ${msg.document.caption}` : `📎 [${msg.document?.filename ?? "Documento"}]`;
  if (msg.type === "sticker")  return "🎭 [Sticker]";
  if (msg.type === "location") return `📍 [Ubicación: ${msg.location?.name ?? `${msg.location?.latitude},${msg.location?.longitude}`}]`;
  return null;
}
