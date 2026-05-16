import type { WASocket, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import {
  getOrCreateConversation, insertMessage, getRecentHistory, getConversationById,
  getBotState, insertPaymentProof, getOrCreateDeal, updateDealStage,
  getCompanyConfig,
} from "../db";
import { processBotMessage } from "../bot/state-machine";
import { sendWithAntiBlock } from "../bot/anti-block";
import { sendEmail } from "../email";

const PROOFS_DIR = path.resolve(process.cwd(), "public", "uploads", "proofs");

const ALLOWED_MIMETYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const PAYMENT_STATES = ["QUOTE_SENT", "AWAITING_PAYMENT", "COLLECTING_PEOPLE"];

export async function handleIncomingMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo
): Promise<void> {
  if (msg.key.fromMe) return;

  const remoteJid = msg.key.remoteJid ?? "";
  if (remoteJid.endsWith("@g.us")) return;
  if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) return;

  const phone    = remoteJid.split("@")[0];
  const pushName = msg.pushName ?? undefined;
  const convo    = getOrCreateConversation(phone, pushName);

  // ── Detección de imagen o PDF (comprobante de pago) ──────────────────
  const imageMsg    = msg.message?.imageMessage;
  const documentMsg = msg.message?.documentMessage;
  const mediaMsg    = imageMsg ?? documentMsg ?? null;

  if (mediaMsg) {
    const mimetype = mediaMsg.mimetype ?? "";
    const ext      = ALLOWED_MIMETYPES[mimetype];

    if (!ext) {
      // Tipo no permitido
      await sendWithAntiBlock(sock, remoteJid,
        `Solo aceptamos comprobantes en formato JPG, PNG o PDF. Por favor envíalo en uno de esos formatos.`,
        phone
      );
      return;
    }

    const botState = getBotState(convo.id);
    const currentState = botState?.state ?? "";

    if (!PAYMENT_STATES.includes(currentState) && currentState !== "BROWSING") {
      // No estamos esperando pago, ignorar silenciosamente
      return;
    }

    // Descargar y guardar el archivo
    try {
      if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });

      const buffer = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
      const filename = `proof_${convo.id}_${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(PROOFS_DIR, filename), buffer);

      const deal = getOrCreateDeal(convo.id);
      insertPaymentProof(convo.id, deal.id, filename, mimetype);
      updateDealStage(deal.id, "NEGOCIACION");
      insertMessage(convo.id, "user", `[Comprobante de pago adjunto: ${filename}]`);

      // Respuesta al cliente
      await sendWithAntiBlock(sock, remoteJid,
        `✅ ¡Recibimos tu comprobante de pago! Lo estamos verificando y te confirmaremos tu reserva en breve. Gracias por tu paciencia. 🙏`,
        phone
      );
      insertMessage(convo.id, "assistant", `✅ ¡Recibimos tu comprobante de pago! Lo estamos verificando y te confirmaremos tu reserva en breve. Gracias por tu paciencia. 🙏`);

      // Email de alerta al admin
      const company = getCompanyConfig();
      if (company.email) {
        const fresh = getConversationById(convo.id);
        const clientName = pushName ?? phone;
        try {
          await sendEmail(
            company.email,
            `⚠️ Comprobante de pago recibido — ${clientName}`,
            `<h2>Nuevo comprobante de pago recibido</h2>
             <p><strong>Cliente:</strong> ${clientName}</p>
             <p><strong>Teléfono:</strong> ${phone}</p>
             <p><strong>Formato:</strong> ${ext.toUpperCase()}</p>
             <p><strong>Hora:</strong> ${new Date().toLocaleString("es-CO")}</p>
             <hr/>
             <p>Ingresa al dashboard para revisar el comprobante y confirmar la reserva.</p>`
          );
        } catch (emailErr) {
          console.warn("[handler] No se pudo enviar email de alerta:", emailErr);
        }
      }

      console.log(`[bot] 📎 Comprobante recibido de ${phone} (${ext.toUpperCase()})`);
    } catch (err) {
      console.error("[handler] Error procesando comprobante:", err);
    }
    return;
  }

  // ── Mensaje de texto normal ───────────────────────────────────────────
  const text =
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    null;

  if (!text) return;

  console.log(`[bot] ← Mensaje de ${phone}: "${text.slice(0, 60)}"`);
  insertMessage(convo.id, "user", text);

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== "AI") return;

  const history = getRecentHistory(convo.id, 20);
  try {
    await processBotMessage(sock, convo.id, phone, remoteJid, text, history);
  } catch (err) {
    console.error(`[bot] Error procesando mensaje de ${phone}:`, err);
  }
}
