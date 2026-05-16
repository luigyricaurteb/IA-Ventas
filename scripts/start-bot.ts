// env-loader DEBE ser el primer import — carga .env.local antes de que
// cualquier módulo lea process.env (los imports ES se hoistean al top)
import "./env-loader";

import fs from "node:fs";
import path from "node:path";
import { start, getHandle } from "../src/lib/baileys/client";
import {
  getPendingOutbox, markOutboxSent, setConnectionState,
  getReservationsForReminders, markReminder24hSent, markReminderPostSent,
  getCompanyConfig, insertMessage,
} from "../src/lib/db";

const RESTART_FLAG = path.resolve(process.cwd(), "data", ".restart");
const AUTH_DIR = process.env.AUTH_DIR || path.resolve(process.cwd(), "auth");

async function main() {
  console.log("[bot] Iniciando agente WhatsApp...");
  setConnectionState({ status: "disconnected", qr_string: null, phone: null });

  await start();

  // Outbox: poll cada 2s para enviar mensajes humanos del dashboard
  setInterval(async () => {
    const pending = getPendingOutbox(20);
    if (pending.length === 0) return;

    const handle = getHandle();
    if (!handle) return;

    for (const item of pending) {
      try {
        const jid = `${item.phone}@s.whatsapp.net`;
        await handle.sock.sendMessage(jid, { text: item.content });
        markOutboxSent(item.id);
        console.log(`[bot] → Outbox enviado a ${item.phone}: "${item.content}"`);
      } catch (err) {
        console.warn(`[bot] Error enviando outbox id=${item.id}:`, err);
      }
    }
  }, 2000);

  // Recordatorios automáticos: poll cada 5 minutos
  setInterval(async () => {
    const handle = getHandle();
    if (!handle) return;
    const company = getCompanyConfig();
    const companyName = company.name ?? "nuestra empresa";
    const now = Math.floor(Date.now() / 1000);

    const pending = getReservationsForReminders();
    for (const res of pending) {
      if (!res.phone) continue;
      const jid = `${res.phone}@s.whatsapp.net`;
      const needsPost = res.reminder_post_sent === 0 && res.service_date + 7200 < now;
      const needs24h  = res.reminder_24h_sent  === 0 && res.service_date > now && res.service_date - now < 86400;

      if (needs24h) {
        const fecha = new Date(res.service_date * 1000).toLocaleString("es-CO", { weekday:"long", hour:"2-digit", minute:"2-digit" });
        const msg = `⏰ *Recordatorio de tu reserva*\n\n${res.reservation_code ? `📋 ${res.reservation_code}\n` : ""}📦 ${res.service_name ?? "Servicio"}\n📅 Mañana — ${fecha}\n👥 ${res.people_count} personas\n\n¡Nos vemos pronto! Cualquier duda escríbenos. *${companyName}*`;
        try {
          await handle.sock.sendMessage(jid, { text: msg });
          markReminder24hSent(res.id);
          console.log(`[bot] 🔔 Recordatorio 24h enviado a ${res.phone}`);
        } catch (e) { console.warn("[bot] Error enviando recordatorio 24h:", e); }
      }

      if (needsPost) {
        const msg = `✅ *¿Cómo fue tu experiencia con ${companyName}?*\n\nEsperamos que hayas disfrutado el servicio. Tu opinión nos ayuda a mejorar.\n\n¿Todo fue a tu satisfacción? Respóndenos aquí 😊`;
        try {
          await handle.sock.sendMessage(jid, { text: msg });
          markReminderPostSent(res.id);
          console.log(`[bot] 🔔 Recordatorio post-servicio enviado a ${res.phone}`);
        } catch (e) { console.warn("[bot] Error enviando recordatorio post:", e); }
      }
    }
  }, 5 * 60 * 1000); // cada 5 minutos

  // Restart flag: poll cada 1s para reiniciar cuando el dashboard lo pide
  setInterval(async () => {
    if (!fs.existsSync(RESTART_FLAG)) return;
    fs.unlinkSync(RESTART_FLAG);
    console.log("[bot] Flag de reinicio detectado. Desconectando...");

    setConnectionState({ status: "disconnected", qr_string: null, phone: null });

    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch {}

    console.log("[bot] Iniciando con QR nuevo...");
    await start();
  }, 1000);
}

main().catch((err) => {
  console.error("[bot] Error fatal:", err);
  process.exit(1);
});
