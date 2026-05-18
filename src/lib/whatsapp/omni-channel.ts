/**
 * Servicio omnicanal — envía mensajes por WhatsApp, Instagram o Facebook Messenger
 * según el canal de la conversación.
 */
import { sendText as sendWhatsApp } from "./meta-api";

const BASE = "https://graph.facebook.com/v21.0";

function getPageToken(db: import("better-sqlite3").Database): string {
  const cfg = db.prepare(
    "SELECT fb_page_token FROM whatsapp_config WHERE id=1"
  ).get() as { fb_page_token: string | null } | null;
  return cfg?.fb_page_token ?? process.env.FB_PAGE_TOKEN ?? "";
}

// ── Enviar mensaje según canal ────────────────────────────────────────────────
export async function sendOmniMessage(
  db: import("better-sqlite3").Database,
  channel: "whatsapp" | "instagram" | "facebook",
  recipientId: string,   // phone para WA, PSID para FB/IG
  text: string
): Promise<void> {
  if (channel === "whatsapp") {
    await sendWhatsApp(db, recipientId, text);
    return;
  }

  // Facebook Messenger e Instagram usan la misma Send API
  const token = getPageToken(db);
  if (!token) throw new Error(`Token de página no configurado para canal ${channel}`);

  await fetch(`${BASE}/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
    signal: AbortSignal.timeout(15000),
  });
}

// ── Etiqueta y color por canal ────────────────────────────────────────────────
export function channelLabel(channel: string): string {
  switch (channel) {
    case "instagram": return "Instagram";
    case "facebook":  return "Facebook";
    default:          return "WhatsApp";
  }
}

export function channelIcon(channel: string): string {
  switch (channel) {
    case "instagram": return "📸";
    case "facebook":  return "📘";
    default:          return "📱";
  }
}

export function channelColor(channel: string): string {
  switch (channel) {
    case "instagram": return "bg-pink-100 text-pink-700";
    case "facebook":  return "bg-blue-100 text-blue-700";
    default:          return "bg-emerald-100 text-emerald-700";
  }
}
