import type { WASocket } from "@whiskeysockets/baileys";
import { countRecentOutbound, logOutboundMessage, getCompanyConfig } from "../db";

// Bot reactivo: solo responde a quien escribe primero.
// El riesgo real de bloqueo es enviar masivo a desconocidos, no responder conversaciones.
const RATE_LIMIT_PER_HOUR = 80;

// Palabras exactas (mensaje de 1-2 palabras) que indican opt-out
const OPT_OUT_EXACT = ["stop", "basta", "detener", "desinscribir"];

// Frases que deben aparecer como texto completo o frase clara
const OPT_OUT_PHRASES = [
  "no me escribas", "no me contactes", "no quiero ser contactado",
  "elimina mis datos", "borra mis datos", "no más mensajes",
  "no mas mensajes", "darse de baja",
];

export function isOptOutMessage(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Coincidencia exacta con palabras cortas (el mensaje completo es la palabra)
  if (OPT_OUT_EXACT.includes(lower)) return true;

  // Frases completas dentro del mensaje
  if (OPT_OUT_PHRASES.some((phrase) => lower.includes(phrase))) return true;

  return false;
}

export function isWithinBusinessHours(): boolean {
  const config = getCompanyConfig();
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=domingo, 1=lunes...
  const allowedDays = config.business_days.split(",").map(Number);
  if (!allowedDays.includes(day)) return false;
  return hour >= config.business_hours_start && hour < config.business_hours_end;
}

export function canSendToPhone(phone: string): boolean {
  const count = countRecentOutbound(phone, 3600);
  return count < RATE_LIMIT_PER_HOUR;
}

function randomDelay(minMs = 1500, maxMs = 3500): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWithAntiBlock(
  sock: WASocket,
  jid: string,
  text: string,
  phone: string
): Promise<boolean> {
  if (!canSendToPhone(phone)) {
    console.warn(`[anti-block] Rate limit alcanzado para ${phone}. Mensaje no enviado.`);
    return false;
  }

  try {
    // Typing indicator — simula que alguien está escribiendo
    await sock.sendPresenceUpdate("composing", jid);
    await randomDelay(1500, 3000);
    await sock.sendPresenceUpdate("paused", jid);

    await sock.sendMessage(jid, { text });
    logOutboundMessage(phone);
    return true;
  } catch (err) {
    console.error(`[anti-block] Error enviando a ${phone}:`, err);
    return false;
  }
}

// Para mensajes múltiples consecutivos (ej: saludo + pregunta)
export async function sendMultipleWithAntiBlock(
  sock: WASocket,
  jid: string,
  messages: string[],
  phone: string
): Promise<void> {
  for (const text of messages) {
    const ok = await sendWithAntiBlock(sock, jid, text, phone);
    if (!ok) break;
    if (messages.indexOf(text) < messages.length - 1) {
      await randomDelay(800, 1500);
    }
  }
}
