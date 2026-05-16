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

// Acepta comprobantes en cualquier estado excepto los iniciales de consentimiento
const PAYMENT_STATES_EXCLUDED = ["CONSENT_PENDING", "CONSENT_REJECTED", "INIT"];

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
      const currentState = botState?.state ?? "ACTIVE";

      if (PAYMENT_STATES_EXCLUDED.includes(currentState)) {
        console.log(`[bot:${slug}] Archivo en estado ${currentState} — ignorado (consentimiento pendiente)`);
        return;
      }

      try {
        if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });
        const buffer   = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
        const filename = `proof_${slug}_${conv.id}_${Date.now()}.${ext}`;
        const filePath = path.join(PROOFS_DIR, filename);
        fs.writeFileSync(filePath, buffer);

        // ── Obtener deal ──────────────────────────────────────────────────
        const dealRow = db.prepare("SELECT id, total_value, paid_amount FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(conv.id) as { id: number; total_value: number | null; paid_amount: number | null } | null;
        const dealId  = dealRow?.id ?? null;

        // ── Guardar comprobante ───────────────────────────────────────────
        const proofRow = db.prepare(
          "INSERT INTO payment_proofs (conversation_id, deal_id, filename, mimetype) VALUES (?,?,?,?) RETURNING id"
        ).get(conv.id, dealId, filename, mimetype) as { id: number };

        if (dealId) db.prepare("UPDATE crm_deals SET stage='NEGOCIACION' WHERE id=?").run(dealId);

        // ── Leer comprobante con IA (visión) ──────────────────────────────
        let aiInfo: { monto?: number; referencia?: string; pagador?: string; fecha?: string; banco?: string; resumen?: string } = {};
        const apiKey = process.env.OPENROUTER_API_KEY ?? "";
        if (apiKey && (ext === "jpg" || ext === "png" || ext === "webp" || ext === "heic")) {
          try {
            const imageBase64 = buffer.toString("base64");
            const mimeForAI = ext === "png" ? "image/png" : "image/jpeg";
            const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{
                  role: "user",
                  content: [
                    { type: "image_url", image_url: { url: `data:${mimeForAI};base64,${imageBase64}` } },
                    { type: "text", text: `Analiza este comprobante de pago o transferencia bancaria. Extrae SOLO un JSON válido con estos campos (null si no aparece):
{"monto": 0.0, "referencia": "...", "pagador": "...", "fecha": "...", "banco": "...", "resumen": "..."  }
- monto: valor numérico en pesos colombianos (sin puntos ni comas)
- referencia: número de transacción o aprobación
- pagador: nombre del que transfiere
- fecha: fecha en formato YYYY-MM-DD
- banco: nombre del banco o billetera digital
- resumen: descripción de 1 línea de lo que muestra el comprobante` }
                  ]
                }],
                max_tokens: 300,
              }),
              signal: AbortSignal.timeout(15000),
            });
            const aiData = await aiRes.json() as { choices?: { message?: { content?: string } }[] };
            const raw = aiData.choices?.[0]?.message?.content ?? "{}";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) aiInfo = JSON.parse(jsonMatch[0]) as typeof aiInfo;

            // Guardar info extraída en el comprobante
            db.prepare("UPDATE payment_proofs SET ai_amount=?,ai_reference=?,ai_payer=?,ai_date=?,ai_bank=?,ai_raw=? WHERE id=?")
              .run(aiInfo.monto ?? null, aiInfo.referencia ?? null, aiInfo.pagador ?? null, aiInfo.fecha ?? null, aiInfo.banco ?? null, raw, proofRow.id);

            console.log(`[bot:${slug}] 🤖 Comprobante analizado: $${aiInfo.monto?.toLocaleString("es-CO") ?? "?"} — ${aiInfo.resumen ?? "sin resumen"}`);
          } catch (e) {
            console.warn(`[bot:${slug}] No se pudo analizar el comprobante con IA:`, e);
          }
        }

        // ── Verificar monto mínimo (50% para abono) ───────────────────────
        const totalReq   = dealRow?.total_value ?? 0;
        const paidBefore = dealRow?.paid_amount ?? 0;
        const aiMonto    = aiInfo.monto ?? 0;
        const minAbono   = totalReq * 0.5;
        const totalPaid  = paidBefore + aiMonto;

        let replyMsg: string;

        if (totalReq > 0 && aiMonto > 0 && aiMonto < minAbono && totalPaid < totalReq) {
          // Monto insuficiente para abono
          replyMsg = `⚠️ Recibimos tu comprobante por *$${aiMonto.toLocaleString("es-CO")} COP*.\n\nPara confirmar una reserva necesitamos un mínimo del *50%* del valor total:\n• Total: *$${totalReq.toLocaleString("es-CO")} COP*\n• Mínimo requerido: *$${minAbono.toLocaleString("es-CO")} COP*\n\nPor favor envía un comprobante por el monto correcto o contáctanos para más información.`;
        } else if (totalReq > 0 && aiMonto > 0 && totalPaid >= totalReq) {
          // Pago completo
          replyMsg = `✅ ¡Comprobante recibido! Detectamos un pago de *$${aiMonto.toLocaleString("es-CO")} COP*. El equipo lo verificará y confirmará tu reserva pronto. ¡Gracias! 🙏`;
        } else if (totalReq > 0 && aiMonto > 0 && totalPaid >= minAbono) {
          // Abono válido (≥50%)
          const saldo = totalReq - totalPaid;
          replyMsg = `✅ ¡Comprobante de abono recibido! *$${aiMonto.toLocaleString("es-CO")} COP*.\n\nQueda un saldo pendiente de *$${saldo.toLocaleString("es-CO")} COP*. Una vez pagues el saldo completo activaremos tu reserva. 📋`;
        } else {
          replyMsg = `✅ ¡Recibimos tu comprobante! Lo estamos verificando y te confirmamos pronto. ¡Gracias! 🙏`;
        }

        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "user", `[Comprobante recibido: $${aiMonto > 0 ? aiMonto.toLocaleString("es-CO") : "?"} COP]`);
        await sendWithAntiBlock(sock, remoteJid, replyMsg, phone);
        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "assistant", replyMsg);
        console.log(`[bot:${slug}] 📎 Comprobante de ${phone} procesado`);

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
