import type { WASocket, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import { getCompanyDb } from "../master/db-company";
import { processBotMessage } from "../bot/state-machine";
import { sendWithAntiBlock } from "../bot/anti-block";

const PROOFS_DIR = path.resolve(process.cwd(), "public", "uploads", "proofs");

const ALLOWED_MIMETYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "application/pdf": "pdf",
};

const PAYMENT_STATES = ["QUOTE_SENT", "AWAITING_PAYMENT", "COLLECTING_PEOPLE"];

export async function handleIncomingMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  slug = "platform"
): Promise<void> {
  if (msg.key.fromMe) return;

  const remoteJid = msg.key.remoteJid ?? "";
  if (remoteJid.endsWith("@g.us")) return;
  if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) return;

  const db       = getCompanyDb(slug);
  const phone    = remoteJid.split("@")[0];
  const pushName = msg.pushName ?? undefined;

  // Crear / actualizar conversación
  const convo = db.prepare(
    "INSERT INTO conversations (phone, name) VALUES (?,?) ON CONFLICT(phone) DO UPDATE SET name=COALESCE(excluded.name, name), last_message_at=unixepoch() RETURNING *"
  ).get(phone, pushName ?? null) as { id: number; phone: string; mode: string };

  // ── Comprobante de pago (imagen o PDF) ────────────────────────────────
  const imageMsg    = msg.message?.imageMessage;
  const documentMsg = msg.message?.documentMessage;
  const mediaMsg    = imageMsg ?? documentMsg ?? null;

  if (mediaMsg) {
    const mimetype = mediaMsg.mimetype ?? "";
    const ext      = ALLOWED_MIMETYPES[mimetype];

    if (!ext) {
      await sendWithAntiBlock(sock, remoteJid,
        "Solo aceptamos comprobantes en formato JPG, PNG o PDF. Por favor envíalo en uno de esos formatos.",
        phone
      );
      return;
    }

    const botState = db.prepare("SELECT state FROM bot_conversation_state WHERE conversation_id=?").get(convo.id) as { state: string } | null;
    const currentState = botState?.state ?? "";

    if (!PAYMENT_STATES.includes(currentState) && currentState !== "BROWSING") return;

    try {
      if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });

      const buffer = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
      const filename = `proof_${slug}_${convo.id}_${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(PROOFS_DIR, filename), buffer);

      // Obtener o crear deal
      const contact = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(convo.id) as { id: number } | null;
      const deal = db.prepare(
        "INSERT INTO crm_deals (conversation_id, contact_id, stage) VALUES (?,?,?) ON CONFLICT DO NOTHING RETURNING *"
      ).get(convo.id, contact?.id ?? null, "NEGOCIACION") as { id: number } | null;
      const dealId = deal?.id ?? (db.prepare("SELECT id FROM crm_deals WHERE conversation_id=?").get(convo.id) as { id: number } | null)?.id ?? null;

      db.prepare("INSERT INTO payment_proofs (conversation_id, deal_id, filename, mimetype) VALUES (?,?,?,?)").run(convo.id, dealId, filename, mimetype);
      if (dealId) db.prepare("UPDATE crm_deals SET stage='NEGOCIACION' WHERE id=?").run(dealId);
      db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(convo.id, "user", `[Comprobante: ${filename}]`);

      const replyMsg = "✅ ¡Recibimos tu comprobante de pago! Lo estamos verificando y te confirmaremos tu reserva en breve. Gracias por tu paciencia. 🙏";
      await sendWithAntiBlock(sock, remoteJid, replyMsg, phone);
      db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(convo.id, "assistant", replyMsg);

      // Email de alerta si hay SMTP configurado
      const company = db.prepare("SELECT email FROM company_config WHERE id=1").get() as { email: string | null } | null;
      const smtp = db.prepare("SELECT * FROM smtp_config WHERE id=1").get() as { host: string | null; port: number; secure: number; user: string | null; password: string | null; from_name: string | null; from_email: string | null } | null;
      if (company?.email && smtp?.host && smtp?.user) {
        try {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure === 1, auth: { user: smtp.user, pass: smtp.password ?? "" } });
          await transporter.sendMail({
            from: `"${smtp.from_name ?? "Agente"}" <${smtp.from_email ?? smtp.user}>`,
            to: company.email,
            subject: `⚠️ Comprobante recibido — ${pushName ?? phone}`,
            html: `<h2>Nuevo comprobante</h2><p><b>Cliente:</b> ${pushName ?? phone}</p><p><b>Teléfono:</b> ${phone}</p><p><b>Formato:</b> ${ext.toUpperCase()}</p>`,
          });
        } catch {}
      }

      console.log(`[bot:${slug}] 📎 Comprobante recibido de ${phone}`);
    } catch (err) {
      console.error(`[handler:${slug}] Error procesando comprobante:`, err);
    }
    return;
  }

  // ── Mensaje de texto normal ───────────────────────────────────────────
  const text =
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    null;

  if (!text) return;

  console.log(`[bot:${slug}] ← ${phone}: "${text.slice(0, 60)}"`);
  db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(convo.id, "user", text);
  db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(convo.id);

  // Solo procesar si está en modo AI
  const fresh = db.prepare("SELECT mode FROM conversations WHERE id=?").get(convo.id) as { mode: string } | null;
  if (!fresh || fresh.mode !== "AI") return;

  const history = db.prepare(
    "SELECT role, content FROM messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at DESC LIMIT 20"
  ).all(convo.id) as { role: string; content: string }[];

  try {
    await processBotMessage(sock, convo.id, phone, remoteJid, text, history.reverse(), slug);
  } catch (err) {
    console.error(`[bot:${slug}] Error procesando mensaje de ${phone}:`, err);
  }
}
