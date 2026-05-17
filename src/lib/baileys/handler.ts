import type { WASocket, proto } from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import { getCompanyDb } from "../master/db-company";
import { processBotMessage } from "../bot/state-machine";
import { sendWithAntiBlock } from "../bot/anti-block";
import { sendAlert } from "../email";

// Detecta si el mensaje contiene el nombre del cliente
function extractNameFromText(text: string): string | null {
  const t = text.trim();
  // Frases explícitas
  const patterns = [
    /(?:me llamo|mi nombre es|soy|habla|te escribe|le escribe)\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+){0,3})/i,
    /^([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){1,3})$/,  // Solo un nombre completo (2-4 palabras)
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1] && m[1].length >= 3 && m[1].length <= 60) return m[1].trim();
  }
  return null;
}

// Guardar en DATA_DIR (volumen Railway) para persistencia entre deployments
const DATA_DIR   = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const PROOFS_DIR = path.join(DATA_DIR, "uploads", "proofs");

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

const HUMAN_RESUME_SECS = 5 * 60; // 5 minutos

export async function handleIncomingMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  slug = "platform"
): Promise<void> {
  try {
    // ── Mensaje enviado por la empresa desde su propio WhatsApp ────────────
    if (msg.key.fromMe) {
      const remoteJid = msg.key.remoteJid ?? "";
      if (!remoteJid.endsWith("@s.whatsapp.net")) return;
      const phone = remoteJid.split("@")[0];
      const db    = getCompanyDb(slug);

      const conv = db.prepare("SELECT id, mode FROM conversations WHERE phone=?").get(phone) as { id: number; mode: string } | null;
      if (!conv) return;

      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ?? null;
      if (!text) return;

      // Verificar si es eco del bot (mismo contenido en los últimos 30s)
      const botEcho = db.prepare(
        "SELECT id FROM messages WHERE conversation_id=? AND role='assistant' AND content=? AND created_at > ? LIMIT 1"
      ).get(conv.id, text, Math.floor(Date.now() / 1000) - 30) as { id: number } | null;
      if (botEcho) return; // Es nuestro propio mensaje rebotando — ignorar

      // Es el admin respondiendo desde su celular → modo HUMAN + guardar mensaje
      db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "assistant", text);
      db.prepare("UPDATE conversations SET mode='HUMAN', human_took_over_at=unixepoch(), last_message_at=unixepoch() WHERE id=?").run(conv.id);
      console.log(`[bot:${slug}] 📱 Admin respondió desde celular → modo HUMAN activado para ${phone}`);
      return;
    }

    const remoteJid = msg.key.remoteJid ?? "";
    if (!remoteJid.endsWith("@s.whatsapp.net")) return; // ignorar grupos, LIDs y otros

    const phone    = remoteJid.split("@")[0];
    const pushName = msg.pushName ?? undefined;
    const db       = getCompanyDb(slug);

    // Crear / actualizar conversación
    let conv = db.prepare("SELECT id, phone, mode, name FROM conversations WHERE phone=?").get(phone) as { id: number; phone: string; mode: string; name: string | null } | null;
    const isNewConv = !conv;
    if (!conv) {
      conv = db.prepare("INSERT INTO conversations (phone, name) VALUES (?,?) RETURNING id, phone, mode, name")
        .get(phone, pushName ?? null) as { id: number; phone: string; mode: string; name: string | null };
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

      // Descargar el archivo
      try {
        if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });
        const buffer   = await downloadMediaMessage(msg, "buffer", {}) as Buffer;
        const apiKey   = process.env.OPENROUTER_API_KEY ?? "";
        const isImage  = ["jpg","png","webp","heic","heif"].includes(ext);
        const mimeForAI = ext === "png" ? "image/png" : "image/jpeg";

        // ── Clasificar la imagen ANTES de procesarla ──────────────────────
        let imageType: "payment" | "other" = "other";
        let imageDescription = "";

        if (apiKey && isImage) {
          try {
            const imgB64 = buffer.toString("base64");
            const classRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ role: "user", content: [
                  { type: "image_url", image_url: { url: `data:${mimeForAI};base64,${imgB64}` } },
                  { type: "text", text: `Analiza esta imagen y responde con UN JSON:
{"tipo":"COMPROBANTE|OTRO","descripcion":"descripción breve en español de máximo 2 oraciones de lo que muestra la imagen"}

COMPROBANTE: si es transferencia bancaria, recibo de pago, voucher, captura de app bancaria con transacción, Nequi/Daviplata.
OTRO: capturas de pantalla de conversaciones, fotos de productos/lugares, documentos de identidad, imágenes informativas, cualquier otra cosa.

Responde SOLO con el JSON, sin texto adicional.` }
                ]}],
                max_tokens: 150, temperature: 0,
              }),
              signal: AbortSignal.timeout(15000),
            });
            const classData = await classRes.json() as { choices?: { message?: { content?: string } }[] };
            const raw = classData.choices?.[0]?.message?.content ?? "{}";
            const jm = raw.match(/\{[\s\S]*\}/);
            if (jm) {
              const parsed = JSON.parse(jm[0]) as { tipo?: string; descripcion?: string };
              imageType = (parsed.tipo ?? "").includes("COMPROBANTE") ? "payment" : "other";
              imageDescription = parsed.descripcion ?? "";
            }
          } catch { /* clasificación falla → asumir 'other' */ }
        }

        console.log(`[bot:${slug}] 🖼️ Imagen clasificada: ${imageType} — ${imageDescription.slice(0, 60)}`);

        // ── Si NO es comprobante de pago: describir y pedir contexto ─────
        if (imageType !== "payment") {
          const imgContent = imageDescription ? `📷 ${imageDescription}` : "📷 [Imagen enviada]";
          db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)")
            .run(conv.id, "user", imgContent);
          db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);

          // Intentar dar una respuesta con contexto de la conversación
          const history = db.prepare(
            "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 15"
          ).all(conv.id) as { role: string; content: string }[];

          const cfg = db.prepare("SELECT ai_name, name FROM company_config WHERE id=1").get() as { ai_name: string | null; name: string | null } | null;
          const aiName2 = cfg?.ai_name ?? "Julieta";
          const { generateReply, isUncertainResponse } = await import("../openrouter");

          const contextMsg = imageDescription
            ? `El cliente acaba de enviar una imagen. Lo que muestra la imagen: ${imageDescription}. Responde de forma natural y útil.`
            : "El cliente acaba de enviar una imagen. Pregúntale amablemente qué necesita o qué intenta mostrarnos.";

          const histWithImage = [...history, { role: "user", content: contextMsg }];
          let reply: string;
          try {
            reply = await generateReply(histWithImage, slug);
            if (isUncertainResponse(reply) || !reply) {
              reply = `📷 Recibí tu imagen${imageDescription ? ` — parece ser: *${imageDescription}*` : ""}.\n\n¿Puedes contarme qué necesitas o qué nos estás intentando mostrar? Uno de nuestros asesores te ayudará pronto. 😊`;
            }
          } catch {
            reply = `Recibí tu imagen. ¿Puedes contarme más sobre lo que necesitas? Un asesor te responderá en breve 😊`;
          }

          await sendWithAntiBlock(sock, remoteJid, reply, phone);
          db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "assistant", reply);
          return;
        }

        // ── Es comprobante de pago → flujo normal ─────────────────────────
        const filename = `proof_${slug}_${conv.id}_${Date.now()}.${ext}`;
        const filePath = path.join(PROOFS_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        console.log(`[bot:${slug}] ✅ Comprobante guardado: ${filename}`);

        // Registrar mensaje del usuario y actualizar last_message_at
        db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)")
          .run(conv.id, "user", `[Comprobante enviado: ${filename}]`);
        db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);

        // Obtener deal
        const dealRow = db.prepare("SELECT id, total_value, paid_amount FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1")
          .get(conv.id) as { id: number; total_value: number | null; paid_amount: number | null } | null;
        const dealId = dealRow?.id ?? null;

        // Guardar comprobante en DB (pendiente de confirmación)
        const proofRow = db.prepare(
          "INSERT INTO payment_proofs (conversation_id, deal_id, filename, mimetype) VALUES (?,?,?,?) RETURNING id"
        ).get(conv.id, dealId, filename, mimetype) as { id: number };

        // ── Leer con IA el comprobante (ya clasificado como pago) ─────────────
        let aiMonto = 0;
        let aiInfo: Record<string, string | number | null> = {};

        if (apiKey && isImage) {
          try {
            const imageBase64 = buffer.toString("base64");

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

    // ── Mensajes de catálogo WhatsApp Business ────────────────────────────
    const m = msg.message as Record<string, unknown> | null;
    const productMsg = m?.productMessage as {
      product?: {
        title?: string; description?: string;
        priceAmount1000?: { low?: number; high?: number } | number;
        currencyCode?: string; retailerId?: string;
      }
    } | undefined;

    const orderMsg = m?.orderMessage as {
      products?: { name?: string; price?: number; quantity?: number; currency?: string }[];
      totalAmount1000?: number; message?: string;
    } | undefined;

    if (productMsg?.product) {
      const p = productMsg.product;
      const rawPrice = typeof p.priceAmount1000 === "object"
        ? (p.priceAmount1000?.low ?? 0) / 1000
        : (typeof p.priceAmount1000 === "number" ? p.priceAmount1000 / 1000 : 0);
      const priceStr = rawPrice > 0 ? `$${rawPrice.toLocaleString("es-CO")} ${p.currencyCode ?? "COP"}` : "";
      const catalog = [
        `📦 *Producto del catálogo: ${p.title ?? "Sin nombre"}*`,
        p.description ? `📝 ${p.description}` : null,
        priceStr ? `💰 Precio: ${priceStr}` : null,
        p.retailerId ? `🔖 Ref: ${p.retailerId}` : null,
        `\n[El cliente envió este producto del catálogo de WhatsApp Business]`,
      ].filter(Boolean).join("\n");

      db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "user", catalog);
      db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);
      console.log(`[bot:${slug}] 🛍️ Producto de catálogo WA Business: ${p.title}`);
      await processBotMessage(sock, conv.id, phone, remoteJid, catalog, [], slug, pushName);
      return;
    }

    if (orderMsg?.products && orderMsg.products.length > 0) {
      const items = orderMsg.products.map(p =>
        `• ${p.name ?? "Producto"} x${p.quantity ?? 1}${p.price ? ` — $${p.price.toLocaleString("es-CO")}` : ""}`
      ).join("\n");
      const orderText = `🛒 *Pedido recibido:*\n${items}${orderMsg.message ? `\n\n💬 ${orderMsg.message}` : ""}\n\n[El cliente realizó un pedido desde el catálogo de WhatsApp Business]`;
      db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "user", orderText);
      db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);
      console.log(`[bot:${slug}] 🛒 Pedido WA Business: ${orderMsg.products.length} item(s)`);
      await processBotMessage(sock, conv.id, phone, remoteJid, orderText, [], slug, pushName);
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

    // Auto-detectar nombre del cliente si aún no lo tenemos
    if (!conv.name && !pushName) {
      const detectedName = extractNameFromText(text);
      if (detectedName) {
        db.prepare("UPDATE conversations SET name=? WHERE id=?").run(detectedName, conv.id);
        conv = { ...conv, name: detectedName };
        const existingC = db.prepare("SELECT id FROM contacts WHERE conversation_id=? LIMIT 1").get(conv.id) as { id: number } | null;
        if (existingC) {
          db.prepare("UPDATE contacts SET full_name=COALESCE(full_name,?) WHERE id=?").run(detectedName, existingC.id);
        } else {
          db.prepare("INSERT INTO contacts (conversation_id, full_name) VALUES (?,?)").run(conv.id, detectedName);
        }
        console.log(`[bot:${slug}] 👤 Nombre detectado: ${detectedName}`);
      }
    }

    // Alerta de email: conversación nueva O conversación que llevaba 1h+ inactiva
    const lastMsgAt = (db.prepare("SELECT last_message_at FROM conversations WHERE id=?").get(conv.id) as { last_message_at: number | null } | null)?.last_message_at ?? 0;
    const idleSecs  = Math.floor(Date.now() / 1000) - lastMsgAt;
    const shouldAlert = isNewConv || idleSecs > 3600; // nueva o inactiva por 1h+
    if (shouldAlert) {
      sendAlert(db, "new_conversation", {
        phone: `+${phone}`,
        name: conv.name ?? pushName ?? null,
        time: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
        preview: text.slice(0, 120),
      }).catch(() => {});
    }
    db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);

    // ── Verificar modo y auto-reactivación ───────────────────────────────
    const freshConv = db.prepare(
      "SELECT mode, human_took_over_at FROM conversations WHERE id=?"
    ).get(conv.id) as { mode: string; human_took_over_at: number | null } | null;

    if (freshConv?.mode !== "AI") {
      const tookOverAt = freshConv?.human_took_over_at ?? 0;
      const elapsed = Math.floor(Date.now() / 1000) - tookOverAt;

      if (elapsed < HUMAN_RESUME_SECS) {
        const remaining = Math.ceil((HUMAN_RESUME_SECS - elapsed) / 60);
        console.log(`[bot:${slug}] Modo HUMAN — auto-reactivación en ${remaining} min para ${phone}`);
        return;
      }

      // Pasaron 5+ minutos sin respuesta humana → reactivar IA automáticamente
      db.prepare("UPDATE conversations SET mode='AI', human_took_over_at=NULL WHERE id=?").run(conv.id);
      console.log(`[bot:${slug}] ⏱ Auto-reactivando IA después de ${Math.round(elapsed / 60)} min sin respuesta humana — ${phone}`);
    }

    // Historial completo para la IA (lee toda la conversación)
    const history = db.prepare(
      "SELECT role, content FROM messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at ASC LIMIT 30"
    ).all(conv.id) as { role: string; content: string }[];

    await processBotMessage(sock, conv.id, phone, remoteJid, text, history, slug, pushName);

  } catch (err) {
    console.error(`[bot:${slug}] Error CRÍTICO en handleIncomingMessage:`, err);
  }
}
