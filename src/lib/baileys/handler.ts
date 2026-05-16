import type { WASocket, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import { getCompanyDb } from "../master/db-company";
import { processBotMessage } from "../bot/state-machine";
import { sendWithAntiBlock } from "../bot/anti-block";

const PROOFS_DIR = path.resolve(process.cwd(), "public", "uploads", "proofs");

const ALLOWED_MIMETYPES: Record<string, string> = {
  "image/jpeg": "jpg",  "image/jpg": "jpg",  "image/png": "png",
  "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "video/mp4": "mp4", "video/3gpp": "3gp",
};

const PAYMENT_STATES = ["QUOTE_SENT", "AWAITING_PAYMENT", "COLLECTING_PEOPLE", "BROWSING"];

export async function handleIncomingMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  slug = "platform"
): Promise<void> {
  try {
    if (msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid ?? "";
    if (remoteJid.endsWith("@g.us")) return;
    if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) return;

    const phone    = remoteJid.split("@")[0];
    const pushName = msg.pushName ?? undefined;

    console.log(`[bot:${slug}] ← Mensaje de ${phone} (${pushName ?? "sin nombre"})`);

    const db = getCompanyDb(slug);

    // Crear o actualizar conversación
    let conv = db.prepare("SELECT id, phone, mode FROM conversations WHERE phone=?").get(phone) as { id: number; phone: string; mode: string } | null;
    if (!conv) {
      conv = db.prepare(
        "INSERT INTO conversations (phone, name) VALUES (?,?) RETURNING id, phone, mode"
      ).get(phone, pushName ?? null) as { id: number; phone: string; mode: string };
    } else if (pushName) {
      db.prepare("UPDATE conversations SET name=?, last_message_at=unixepoch() WHERE id=?").run(pushName, conv.id);
    } else {
      db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);
    }

    if (!conv) {
      console.error(`[bot:${slug}] No se pudo crear conversación para ${phone}`);
      return;
    }

    // ── Archivos (comprobantes de pago) ───────────────────────────────────
    const imageMsg    = msg.message?.imageMessage;
    const documentMsg = msg.message?.documentMessage;
    const mediaMsg    = imageMsg ?? documentMsg ?? null;

    if (mediaMsg) {
      const mimetype = mediaMsg.mimetype ?? "";
      const ext = ALLOWED_MIMETYPES[mimetype];

      if (!ext) {
        await sendWithAntiBlock(sock, remoteJid,
          "Solo aceptamos comprobantes en formatos: JPG, PNG, WEBP, HEIC, PDF, Word o Excel. Por favor reenvíalo en uno de esos formatos.",
          phone
        );
        return;
      }

      const botState = db.prepare("SELECT state FROM bot_conversation_state WHERE conversation_id=?").get(conv.id) as { state: string } | null;
      const currentState = botState?.state ?? "";

      if (!PAYMENT_STATES.includes(currentState)) {
        console.log(`[bot:${slug}] Archivo recibido fuera de contexto de pago (estado: ${currentState}) — ignorado`);
        return;
      }

      try {
        if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });
        const buffer   = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
        const filename = `proof_${slug}_${conv.id}_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(PROOFS_DIR, filename), buffer);

        const dealRow = db.prepare("SELECT id FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(conv.id) as { id: number } | null;
        const dealId  = dealRow?.id ?? null;

        db.prepare("INSERT INTO payment_proofs (conversation_id, deal_id, filename, mimetype) VALUES (?,?,?,?)").run(conv.id, dealId, filename, mimetype);
        if (dealId) db.prepare("UPDATE crm_deals SET stage='NEGOCIACION' WHERE id=?").run(dealId);
        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "user", `[Comprobante: ${filename}]`);

        const replyMsg = "✅ ¡Recibimos tu comprobante! Lo estamos verificando y te confirmaremos tu reserva pronto. ¡Gracias! 🙏";
        await sendWithAntiBlock(sock, remoteJid, replyMsg, phone);
        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "assistant", replyMsg);
        console.log(`[bot:${slug}] 📎 Comprobante recibido de ${phone}`);
      } catch (err) {
        console.error(`[bot:${slug}] Error procesando comprobante de ${phone}:`, err);
      }
      return;
    }

    // ── Mensaje de texto ──────────────────────────────────────────────────
    const text =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      msg.message?.buttonsResponseMessage?.selectedButtonId ??
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ??
      null;

    if (!text) {
      console.log(`[bot:${slug}] Mensaje sin texto de ${phone} — ignorado`);
      return;
    }

    console.log(`[bot:${slug}] Texto: "${text.slice(0, 80)}"`);

    // Guardar mensaje del usuario
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "user", text);
    db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);

    // Solo procesar si está en modo AI
    const freshMode = db.prepare("SELECT mode FROM conversations WHERE id=?").get(conv.id) as { mode: string } | null;
    if (freshMode?.mode !== "AI") {
      console.log(`[bot:${slug}] Conversación ${conv.id} en modo HUMAN — no procesando con IA`);
      return;
    }

    // Historial para la IA
    const history = db.prepare(
      "SELECT role, content FROM messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at ASC LIMIT 20"
    ).all(conv.id) as { role: string; content: string }[];

    await processBotMessage(sock, conv.id, phone, remoteJid, text, history, slug);

  } catch (err) {
    console.error(`[bot:${slug}] Error CRÍTICO en handleIncomingMessage:`, err);
  }
}
