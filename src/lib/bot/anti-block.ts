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

export function isWithinBusinessHours(
  startHour = 8,
  endHour = 18,
  businessDays = "1,2,3,4,5"
): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day  = now.getDay();
  const allowedDays = businessDays.split(",").map(Number);
  if (!allowedDays.includes(day)) return false;
  return hour >= startHour && hour < endHour;
}

// Simple in-memory rate limiter per phone (resets on process restart)
const rateLedger = new Map<string, number[]>();

function countRecentOutbound(phone: string): number {
  const cutoff = Date.now() - 3600000;
  const times = (rateLedger.get(phone) ?? []).filter(t => t > cutoff);
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

function randomDelay(minMs = 1500, maxMs = 3500): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs));
}

export async function sendWithAntiBlock(sock: WASocket, jid: string, text: string, phone: string): Promise<boolean> {
  if (!canSendToPhone(phone)) {
    console.warn(`[anti-block] Rate limit alcanzado para ${phone}.`);
    return false;
  }
  try {
    await sock.sendPresenceUpdate("composing", jid);
    await randomDelay(1500, 3000);
    await sock.sendPresenceUpdate("paused", jid);
    await sock.sendMessage(jid, { text });
    logOutbound(phone);
    return true;
  } catch (err) {
    console.error(`[anti-block] Error enviando a ${phone}:`, err);
    return false;
  }
}

export async function sendMultipleWithAntiBlock(sock: WASocket, jid: string, messages: string[], phone: string): Promise<void> {
  for (let i = 0; i < messages.length; i++) {
    const ok = await sendWithAntiBlock(sock, jid, messages[i], phone);
    if (!ok) break;
    if (i < messages.length - 1) await randomDelay(800, 1500);
  }
}
