import type { WASocket } from "@whiskeysockets/baileys";

const RATE_LIMIT_PER_HOUR = 80;

const OPT_OUT_EXACT = ["stop","basta","detener","desinscribir"];
const OPT_OUT_PHRASES = [
  "no me escribas","no me contactes","no quiero ser contactado",
  "elimina mis datos","borra mis datos","no más mensajes",
  "no mas mensajes","darse de baja",
];

export function isOptOutMessage(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (OPT_OUT_EXACT.includes(lower)) return true;
  if (OPT_OUT_PHRASES.some(phrase => lower.includes(phrase))) return true;
  return false;
}

/**
 * Verifica si estamos dentro del horario laboral.
 * Usa el offset de zona horaria para convertir UTC a hora local correctamente.
 * @param utcOffsetHours Diferencia horaria respecto a UTC. Colombia = -5
 */
export function isWithinBusinessHours(
  startHour = 8,
  endHour = 20,
  businessDays = "1,2,3,4,5,6",
  utcOffsetHours = -5   // Colombia UTC-5 por defecto
): boolean {
  const nowUtc  = new Date();
  const localMs = nowUtc.getTime() + utcOffsetHours * 3600 * 1000;
  const local   = new Date(localMs);
  const hour    = local.getUTCHours();
  const day     = local.getUTCDay();

  const allowedDays = businessDays.split(",").map(Number).filter(n => !isNaN(n));
  if (!allowedDays.includes(day)) return false;
  return hour >= startHour && hour < endHour;
}

// In-memory rate limiter per phone
const rateLedger = new Map<string, number[]>();

function countRecentOutbound(phone: string): number {
  const cutoff = Date.now() - 3600000;
  const times  = (rateLedger.get(phone) ?? []).filter(t => t > cutoff);
  rateLedger.set(phone, times);
  return times.length;
}

function logOutbound(phone: string) {
  const times = rateLedger.get(phone) ?? [];
  times.push(Date.now());
  rateLedger.set(phone, times);
}

export function canSendToPhone(phone: string): boolean {
  return countRecentOutbound(phone) < RATE_LIMIT_PER_HOUR;
}

function randomDelay(minMs = 800, maxMs = 2500): Promise<void> {
  return new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs)
  );
}

export async function sendWithAntiBlock(
  sock: WASocket,
  jid: string,
  text: string,
  phone: string
): Promise<boolean> {
  if (!canSendToPhone(phone)) {
    console.warn(`[anti-block] Rate limit para ${phone} — mensaje omitido`);
    return false;
  }
  try {
    try { await sock.sendPresenceUpdate("composing", jid); } catch {}
    await randomDelay();
    try { await sock.sendPresenceUpdate("paused", jid); } catch {}
    await sock.sendMessage(jid, { text });
    logOutbound(phone);
    return true;
  } catch (err) {
    console.error(`[anti-block] Error enviando a ${phone}:`, err);
    return false;
  }
}

export async function sendMultipleWithAntiBlock(
  sock: WASocket,
  jid: string,
  messages: string[],
  phone: string
): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    const ok = await sendWithAntiBlock(sock, jid, messages[i], phone);
    if (!ok) break;
    if (i < messages.length - 1) await randomDelay(500, 1200);
  }
}
