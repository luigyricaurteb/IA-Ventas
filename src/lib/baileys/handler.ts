import type { WASocket, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import { getCompanyDb } from "../master/db-company";
import { processBotMessage } from "../bot/state-machine";
import { sendWithAntiBlock } from "../bot/anti-block";

const PROOFS_DIR = path.resolve(process.cwd(), "public", "uploads", "proofs");

const ALLOWED_MIMETYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Estados donde NO procesamos comprobantes
const PAYMENT_EXCLUDED = ["CONSENT_PENDING", "CONSENT_REJECTED"];

/**
 * Extrae el mensaje de imagen/documento de cualquier formato que use Baileys.
 * WhatsApp empaqueta los archivos de varias formas distintas.
 */
interface MediaLike { mimetype?: string | null }

function extractMediaMessage(msg: proto.IWebMessageInfo): MediaLike | null {
  const m = msg.message;
  if (!m) return null;
  if (m.imageMessage) return m.imageMessage as MediaLike;
  if (m.documentMessage) return m.documentMessage as MediaLike;
  if (m.viewOnceMessage?.message?.imageMessage) return m.viewOnceMessage.message.imageMessage as MediaLike;
  if (m.viewOnceMessageV2?.message?.imageMessage) return m.viewOnceMessageV2.message.imageMessage as MediaLike;
  if (m.ephemeralMessage?.message?.imageMessage) return m.ephemeralMessage.message.imageMessage as MediaLike;
  if (m.ephemeralMessage?.message?.documentMessage) return m.ephemeralMessage.message.documentMessage as MediaLike;
  // documentWithCaptionMessage
  const dwc = (m as Record<string, unknown>).documentWithCaptionMessage as { message?: { documentMessage?: MediaLike } } | undefined;
  if (dwc?.message?.documentMessage) return dwc.message.documentMessage;
  return null;
}

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
    const db       = getCompanyDb(slug);

    // Crear / actualizar conversación
    let conv = db.prepare("SELECT id, phone, mode FROM conversations WHERE phone=?").get(phone) as { id: number; phone: string; mode: string } | null;
    if (!conv) {
      conv = db.prepare("INSERT INTO conversations (phone, name) VALUES (?,?) RETURNING id, phone, mode")
        .get(phone, pushName ?? null) as { id: number; phone: string; mode: string };
    } else {
      db.prepare("UPDATE conversations SET last_message_at=unixepoch()" + (pushName ? ", name=COALESCE(name,?)" : "") + " WHERE id=?")
        .run(...(pushName ? [pushName, conv.id] : [conv.id]));
    }

    if (!conv) {
      console.error(`[bot:${slug}] No se pudo crear conversación para ${phone}`);
      return;
    }

    console.log(`[bot:${slug}] ← Mensaje tipo=${Object.keys(msg.message ?? {}).join(",")} de ${phone}`);

    // ── Detectar archivo multimedia ───────────────────────────────────────
    const mediaMsg = extractMediaMessage(msg);

    if (mediaMsg) {
      const mimetype = mediaMsg.mimetype ?? "";
      const ext      = ALLOWED_MIMETYPES[mimetype];

      console.log(`[bot:${slug}] 📎 Archivo recibido — mimetype: ${mimetype}, ext: ${ext ?? "NO PERMITIDO"}`);

      if (!ext) {
        await sendWithAntiBlock(sock, remoteJid,
          "Solo aceptamos comprobantes en: JPG, PNG, PDF, Word o Excel. Por favor reenvíalo en uno de esos formatos. 😊",
          phone
        );
        return;
      }

      // Verificar estado del bot
      const botState = db.prepare("SELECT state, data FROM bot_conversation_state WHERE conversation_id=?")
        .get(conv.id) as { state: string; data: string } | null;
      const currentState = botState?.state ?? "ACTIVE";

      if (PAYMENT_EXCLUDED.includes(currentState)) {
        console.log(`[bot:${slug}] Archivo ignorado — estado: ${currentState}`);
        return;
      }

      // Descargar y guardar el archivo
      try {
        if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });
        const buffer   = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
        const filename = `proof_${slug}_${conv.id}_${Date.now()}.${ext}`;
        const filePath = path.join(PROOFS_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        console.log(`[bot:${slug}] ✅ Archivo guardado: ${filename}`);

        // Registrar mensaje del usuario
        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)")
          .run(conv.id, "user", `[Comprobante enviado: ${filename}]`);

        // Obtener deal
        const dealRow = db.prepare("SELECT id, total_value, paid_amount FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1")
          .get(conv.id) as { id: number; total_value: number | null; paid_amount: number | null } | null;
        const dealId = dealRow?.id ?? null;

        // Guardar comprobante en DB (pendiente de confirmación)
        const proofRow = db.prepare(
          "INSERT INTO payment_proofs (conversation_id, deal_id, filename, mimetype) VALUES (?,?,?,?) RETURNING id"
        ).get(conv.id, dealId, filename, mimetype) as { id: number };

        // ── Leer con IA (visión) ────────────────────────────────────────────
        let aiMonto = 0;
        let aiInfo: Record<string, string | number | null> = {};
        const apiKey = process.env.OPENROUTER_API_KEY ?? "";
        const isImage = ["jpg","png","webp","heic","heif"].includes(ext);

        if (apiKey && isImage) {
          try {
            const imageBase64 = buffer.toString("base64");
            const mimeForAI   = ext === "png" ? "image/png" : "image/jpeg";

            const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{
                  role: "user",
                  content: [
                    { type: "image_url", image_url: { url: `data:${mimeForAI};base64,${imageBase64}` } },
                    { type: "text", text: `Analiza este comprobante de pago o transferencia bancaria colombiana. Extrae SOLO un JSON válido sin texto adicional:
{"monto":0,"moneda":"COP","referencia":"","pagador":"","fecha":"","banco":"","descripcion":""}
- monto: número entero sin puntos ni comas (ej: 150000)
- moneda: COP o USD
- referencia: número de transacción, aprobación o radicado
- pagador: nombre completo del que transfiere
- fecha: formato YYYY-MM-DD
- banco: nombre del banco, Nequi, Daviplata, etc.
- descripcion: descripción de 1 línea de lo que muestra la imagen` }
                  ]
                }],
                max_tokens: 300,
                temperature: 0,
              }),
              signal: AbortSignal.timeout(20000),
            });

            const aiData = await aiRes.json() as { choices?: { message?: { content?: string } }[] };
            const raw = aiData.choices?.[0]?.message?.content ?? "{}";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              aiInfo = JSON.parse(jsonMatch[0]) as Record<string, string | number | null>;
              aiMonto = typeof aiInfo.monto === "number" ? aiInfo.monto : 0;
            }

            // Guardar datos extraídos
            db.prepare("UPDATE payment_proofs SET ai_amount=?,ai_reference=?,ai_payer=?,ai_date=?,ai_bank=?,ai_raw=? WHERE id=?")
              .run(aiMonto || null, aiInfo.referencia || null, aiInfo.pagador || null, aiInfo.fecha || null, aiInfo.banco || null, raw, proofRow.id);

            console.log(`[bot:${slug}] 🤖 IA leyó: $${aiMonto.toLocaleString("es-CO")} COP — ${aiInfo.descripcion ?? ""}`);
          } catch (e) {
            console.warn(`[bot:${slug}] IA no pudo leer el comprobante:`, (e as Error).message);
          }
        }

        // ── Enviar mensaje de confirmación al cliente ────────────────────────
        const totalReq = dealRow?.total_value ?? 0;
        let confirmMsg: string;

        if (aiMonto > 0) {
          // Guardar el proof_id y monto en el estado del bot para el flujo de confirmación
          const stateData = { proof_id: proofRow.id, ai_monto: aiMonto, total: totalReq };
          db.prepare(`INSERT INTO bot_conversation_state (conversation_id, state, data)
            VALUES (?,?,?)
            ON CONFLICT(conversation_id) DO UPDATE SET state=excluded.state, data=excluded.data, updated_at=unixepoch()`)
            .run(conv.id, "CONFIRMING_PAYMENT", JSON.stringify(stateData));

          // Construir mensaje con toda la info disponible
          let detalle = `💵 Valor detectado: *$${aiMonto.toLocaleString("es-CO")} COP*`;
          if (aiInfo.banco)       detalle += `\n🏦 Banco: ${aiInfo.banco}`;
          if (aiInfo.pagador)     detalle += `\n👤 Pagador: ${aiInfo.pagador}`;
          if (aiInfo.referencia)  detalle += `\n🔖 Referencia: ${aiInfo.referencia}`;
          if (aiInfo.fecha)       detalle += `\n📅 Fecha: ${aiInfo.fecha}`;

          confirmMsg = `📋 Recibimos tu comprobante de pago. Esto es lo que detectamos:\n\n${detalle}\n\n¿Es correcto? Responde *SI* para confirmar o *NO* si el monto es diferente.`;
        } else {
          // No se pudo leer el monto — pedir confirmación manual
          db.prepare(`INSERT INTO bot_conversation_state (conversation_id, state, data)
            VALUES (?,?,?)
            ON CONFLICT(conversation_id) DO UPDATE SET state=excluded.state, data=excluded.data, updated_at=unixepoch()`)
            .run(conv.id, "CONFIRMING_PAYMENT", JSON.stringify({ proof_id: proofRow.id, ai_monto: 0, total: totalReq }));

          confirmMsg = "📎 Recibimos tu comprobante. No pudimos leer el valor automáticamente.\n\nPor favor indica el monto exacto que transferiste (ej: *150000*).";
        }

        await sendWithAntiBlock(sock, remoteJid, confirmMsg, phone);
        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)")
          .run(conv.id, "assistant", confirmMsg);

      } catch (err) {
        console.error(`[bot:${slug}] Error procesando archivo de ${phone}:`, err);
        await sendWithAntiBlock(sock, remoteJid,
          "Tuvimos un problema procesando tu comprobante. Por favor inténtalo de nuevo o escríbenos directamente.",
          phone
        );
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
      console.log(`[bot:${slug}] Mensaje sin texto ni archivo reconocido — tipo: ${Object.keys(msg.message ?? {}).join(",")}`);
      return;
    }

    console.log(`[bot:${slug}] Texto: "${text.slice(0, 80)}"`);

    // Guardar mensaje del usuario
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)")
      .run(conv.id, "user", text);
    db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);

    // Solo procesar con IA si está en modo AI
    const freshMode = db.prepare("SELECT mode FROM conversations WHERE id=?").get(conv.id) as { mode: string } | null;
    if (freshMode?.mode !== "AI") {
      console.log(`[bot:${slug}] Modo HUMAN — no procesando con IA`);
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
