// env-loader DEBE ser el primer import
import "./env-loader";

import { startCompany, getHandle, getAllHandles } from "../src/lib/baileys/client";
import { listCompanies, getExpiringSubscriptions } from "../src/lib/master/db-master";
import { getCompanyDb } from "../src/lib/master/db-company";

async function startAllCompanies() {
  const companies = listCompanies().filter(c => c.status === "active");
  console.log(`[bot] Iniciando ${companies.length} empresa(s) activa(s)...`);
  for (const company of companies) {
    try {
      console.log(`[bot] Iniciando bot para: ${company.slug} (${company.name})`);
      const db = getCompanyDb(company.slug);
      db.prepare("UPDATE connection_state SET status='disconnected', qr_string=NULL, phone=NULL, updated_at=unixepoch() WHERE id=1").run();
      await startCompany(company.slug);
    } catch (err) {
      console.error(`[bot] Error iniciando ${company.slug}:`, err);
    }
  }
}

async function main() {
  console.log("[bot] Iniciando sistema multi-empresa WhatsApp...");

  await startAllCompanies();

  // Outbox: procesar mensajes pendientes cada 2s para todas las empresas
  setInterval(async () => {
    const handles = getAllHandles();
    for (const [slug, handle] of handles) {
      try {
        const db = getCompanyDb(slug);
        const pending = db.prepare("SELECT * FROM outbox WHERE sent=0 ORDER BY created_at ASC LIMIT 20").all() as { id: number; phone: string; content: string }[];
        for (const item of pending) {
          try {
            const jid = `${item.phone}@s.whatsapp.net`;
            await handle.sock.sendMessage(jid, { text: item.content });
            db.prepare("UPDATE outbox SET sent=1 WHERE id=?").run(item.id);
            console.log(`[bot:${slug}] → Enviado a ${item.phone}`);
          } catch (err) {
            console.warn(`[bot:${slug}] Error enviando outbox id=${item.id}:`, err);
          }
        }
      } catch {}
    }
  }, 2000);

  // Recordatorios de reserva: cada 5 minutos para todas las empresas
  setInterval(async () => {
    const handles = getAllHandles();
    const now = Math.floor(Date.now() / 1000);

    for (const [slug, handle] of handles) {
      try {
        const db = getCompanyDb(slug);
        const company = db.prepare("SELECT name FROM company_config WHERE id=1").get() as { name: string | null } | null;
        const companyName = company?.name ?? "nuestra empresa";

        const reservations = db.prepare(`
          SELECT r.*, c.phone
          FROM reservations r
          LEFT JOIN contacts ct ON ct.id = r.contact_id
          LEFT JOIN conversations c ON c.id = ct.conversation_id
          WHERE r.status IN ('pending','confirmed')
            AND c.phone IS NOT NULL
            AND (r.reminder_24h_sent = 0 OR r.reminder_post_sent = 0)
        `).all() as { id: number; phone: string | null; service_date: number; service_name: string | null; people_count: number; reservation_code: string | null; reminder_24h_sent: number; reminder_post_sent: number }[];

        for (const res of reservations) {
          if (!res.phone) continue;
          const jid = `${res.phone}@s.whatsapp.net`;

          if (!res.reminder_24h_sent && res.service_date > now && res.service_date - now < 86400) {
            const fecha = new Date(res.service_date * 1000).toLocaleString("es-CO", { weekday: "long", hour: "2-digit", minute: "2-digit" });
            const msg = `⏰ *Recordatorio de tu reserva*\n\n${res.reservation_code ? `📋 ${res.reservation_code}\n` : ""}📦 ${res.service_name ?? "Servicio"}\n📅 Mañana — ${fecha}\n👥 ${res.people_count} personas\n\n¡Nos vemos pronto! *${companyName}*`;
            try {
              await handle.sock.sendMessage(jid, { text: msg });
              db.prepare("UPDATE reservations SET reminder_24h_sent=1 WHERE id=?").run(res.id);
              console.log(`[bot:${slug}] 🔔 Recordatorio 24h → ${res.phone}`);
            } catch {}
          }

          if (!res.reminder_post_sent && res.service_date + 7200 < now) {
            const msg = `✅ *¿Cómo fue tu experiencia con ${companyName}?*\n\nEsperamos que hayas disfrutado el servicio. Tu opinión nos ayuda a mejorar. ¡Gracias! 😊`;
            try {
              await handle.sock.sendMessage(jid, { text: msg });
              db.prepare("UPDATE reservations SET reminder_post_sent=1 WHERE id=?").run(res.id);
              console.log(`[bot:${slug}] 🔔 Post-servicio → ${res.phone}`);
            } catch {}
          }
        }
      } catch {}
    }
  }, 5 * 60 * 1000);

  // Alertas de vencimiento de plan: cada hora
  setInterval(async () => {
    try {
      const expiring = getExpiringSubscriptions();
      if (expiring.length === 0) return;

      // Intentar enviar por WhatsApp al admin de cada empresa que vence
      for (const sub of expiring) {
        const daysLeft = Math.ceil(((sub.ends_at ?? 0) - Math.floor(Date.now() / 1000)) / 86400);
        console.log(`[bot] ⚠️ Plan de "${sub.company_name}" vence en ${daysLeft} día(s)`);

        // Buscar un número de admin en la empresa
        try {
          const db = getCompanyDb("platform");
          const adminPhone = db.prepare("SELECT phone FROM company_config WHERE id=1").get() as { phone: string | null } | null;
          const handle = getHandle("platform");
          if (handle && adminPhone?.phone) {
            const jid = `${adminPhone.phone.replace(/\D/g, "")}@s.whatsapp.net`;
            await handle.sock.sendMessage(jid, {
              text: `⚠️ *Aviso de vencimiento*\nEl plan de la empresa *${sub.company_name}* vence en *${daysLeft} día(s)*.\nRenueva el plan para no perder el acceso.`,
            });
          }
        } catch {}
      }
    } catch {}
  }, 60 * 60 * 1000);

  // Arrancar nuevas empresas que se activen mientras el bot corre (cada 2 min)
  setInterval(async () => {
    const companies = listCompanies().filter(c => c.status === "active");
    const running = getAllHandles();
    for (const company of companies) {
      if (!running.has(company.slug)) {
        console.log(`[bot] Nueva empresa activa detectada: ${company.slug}`);
        try { await startCompany(company.slug); } catch {}
      }
    }
  }, 2 * 60 * 1000);

  console.log("[bot] Sistema iniciado. Esperando mensajes...");
}

main().catch(err => {
  console.error("[bot] Error fatal:", err);
  process.exit(1);
});
