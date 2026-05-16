import type { WASocket } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import {
  getBotState, setBotState, setBotOptOut,
  getOrCreateConversation, upsertContact,
  getActiveLegalDocument, logConsent,
  listProducts, getProductById, getProductImages,
  getOrCreateDeal, updateDealStage, updateDealProduct,
  getCompanyConfig, listBankAccounts, insertMessage,
  type BotState, type CrmStage,
} from "../db";
import { generateStructuredReply, isUncertainResponse } from "../openrouter";
import { insertJulietaAlert } from "../db";
import { sendWithAntiBlock, sendMultipleWithAntiBlock, isOptOutMessage, isWithinBusinessHours } from "./anti-block";
import { logOutboundMessage } from "../db";
import type { Message } from "../db";

const CONSENT_KEYWORDS_YES = ["si", "sí", "acepto", "ok", "yes", "claro", "dale", "de acuerdo", "correcto", "adelante"];
const CONSENT_KEYWORDS_NO  = ["no", "rechazo", "no acepto", "nope"];
const GREETING_KEYWORDS    = ["hola", "hello", "buenas", "buenos días", "buenas tardes", "buenas noches", "hi", "hey", "buen día"];

function isYes(text: string)      { return CONSENT_KEYWORDS_YES.some((k) => text.toLowerCase().trim().includes(k)); }
function isNo(text: string)       { return CONSENT_KEYWORDS_NO.some((k)  => text.toLowerCase().trim() === k); }
function isGreeting(text: string) { return GREETING_KEYWORDS.some((k)    => text.toLowerCase().trim().startsWith(k)); }

// ── Helpers: guarda en DB Y envía por WhatsApp ───────────────────────────
async function botSend(
  sock: WASocket, jid: string, phone: string, conversationId: number, text: string
): Promise<void> {
  insertMessage(conversationId, "assistant", text);
  await sendWithAntiBlock(sock, jid, text, phone);
}

async function botSendMany(
  sock: WASocket, jid: string, phone: string, conversationId: number, texts: string[]
): Promise<void> {
  for (const t of texts) insertMessage(conversationId, "assistant", t);
  await sendMultipleWithAntiBlock(sock, jid, texts, phone);
}

async function botSendProductImages(
  sock: WASocket, jid: string, phone: string, conversationId: number,
  productId: number, caption: string
): Promise<void> {
  const images = getProductImages(productId);
  if (images.length === 0) return;

  const uploadsDir = path.resolve(process.cwd(), "public", "uploads", "products");

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const filePath = path.join(uploadsDir, img.filename);
    if (!fs.existsSync(filePath)) continue;

    try {
      const buffer = fs.readFileSync(filePath);
      // Solo la primera imagen lleva el caption
      await sock.sendMessage(jid, {
        image: buffer,
        caption: i === 0 ? caption : undefined,
        mimetype: img.filename.endsWith(".png") ? "image/png" : "image/jpeg",
      });
      logOutboundMessage(phone);
      // Pausa entre imágenes para no saturar
      if (i < images.length - 1) await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      console.error(`[bot] Error enviando imagen ${img.filename}:`, err);
    }
  }
}

function botStateToCrmStage(state: BotState): CrmStage | null {
  const map: Partial<Record<BotState, CrmStage>> = {
    COLLECTING_NAME: "NUEVO", COLLECTING_EMAIL: "NUEVO",
    COLLECTING_COMPANY: "NUEVO", COLLECTING_INTEREST: "NUEVO",
    COLLECTING_BUDGET: "NUEVO", COLLECTING_DATE: "NUEVO",
    BROWSING: "CALIFICADO", PRODUCT_SELECTED: "CALIFICADO",
    COLLECTING_PEOPLE: "PROPUESTA", QUOTE_SENT: "PROPUESTA",
    AWAITING_PAYMENT: "NEGOCIACION", DONE: "GANADO",
    CONSENT_REJECTED: "PERDIDO",
  };
  return map[state] ?? null;
}

export async function processBotMessage(
  sock: WASocket,
  conversationId: number,
  phone: string,
  jid: string,
  text: string,
  history: Message[]
): Promise<void> {
  const company     = getCompanyConfig();
  const companyName = company.name ?? "nuestra empresa";
  let botState      = getBotState(conversationId);

  // ── Reactivar conversación (opt-out o perdida) ───────────────────────
  // Si el usuario vuelve a escribir, siempre puede retomar la conversación.
  // "PERDIDO" en CRM es solo un estado del pipeline, no bloquea al bot.
  if (botState?.opted_out) {
    const db = (await import("../db")).default;
    db.prepare("UPDATE bot_conversation_state SET opted_out = 0, state = 'BROWSING', updated_at = unixepoch() WHERE conversation_id = ?").run(conversationId);
    // Crear nuevo deal para este nuevo intento (conserva el anterior como historial)
    db.prepare("INSERT INTO crm_deals (conversation_id, contact_id, stage) SELECT ?, contact_id, 'CALIFICADO' FROM crm_deals WHERE conversation_id = ? ORDER BY id DESC LIMIT 1").run(conversationId, conversationId);
    botState = getBotState(conversationId);
    await botSend(sock, jid, phone, conversationId,
      `¡Hola de nuevo! Me alegra que vuelvas a escribirnos. ¿En qué puedo ayudarte hoy?`
    );
    return;
  }

  // ── Opt-out explícito en este mensaje ────────────────────────────────
  if (isOptOutMessage(text)) {
    setBotOptOut(conversationId);
    const deal = getOrCreateDeal(conversationId);
    updateDealStage(deal.id, "PERDIDO", "Cliente solicitó no ser contactado");
    await botSend(sock, jid, phone, conversationId,
      `Entendido. Hemos removido tus datos de nuestras comunicaciones. Si en el futuro deseas retomar el contacto, escríbenos. ¡Hasta pronto!`
    );
    return;
  }

  // ── Horario laboral ──────────────────────────────────────────────────
  if (!isWithinBusinessHours()) {
    if (!botState || botState.state === "INIT") {
      await botSend(sock, jid, phone, conversationId,
        `Hola! Gracias por escribirnos a *${companyName}*. En este momento estamos fuera de horario de atención. Te responderemos pronto. ¡Hasta luego!`
      );
      setBotState(conversationId, "INIT");
    }
    return;
  }

  const currentState: BotState = botState?.state ?? "INIT";
  const stateData: Record<string, unknown> = botState?.data ? JSON.parse(botState.data) : {};

  // ── INIT ──────────────────────────────────────────────────────────────
  if (currentState === "INIT") {
    const doc = getActiveLegalDocument("data_treatment");
    if (doc) {
      const summary = doc.content.slice(0, 400) + (doc.content.length > 400 ? "..." : "");
      await botSendMany(sock, jid, phone, conversationId, [
        `¡Hola! Bienvenido a *${companyName}* 👋`,
        `Antes de continuar, necesitamos tu autorización para tratar tus datos personales según la *Ley 1581 de 2012*.\n\n📄 *${doc.title}*\n\n${summary}\n\nResponde *SI* para aceptar o *NO* para rechazar.`,
      ]);
      setBotState(conversationId, "CONSENT_PENDING", {}, null);
      getOrCreateDeal(conversationId);
    } else {
      setBotState(conversationId, "COLLECTING_NAME", {}, null);
      const deal = getOrCreateDeal(conversationId);
      updateDealStage(deal.id, "NUEVO");
      await botSend(sock, jid, phone, conversationId,
        `¡Hola! Bienvenido a *${companyName}*. Para atenderte mejor, ¿cuál es tu nombre completo?`
      );
    }
    return;
  }

  // ── CONSENT_PENDING ───────────────────────────────────────────────────
  if (currentState === "CONSENT_PENDING") {
    const doc = getActiveLegalDocument("data_treatment");
    if (isYes(text)) {
      if (doc) logConsent(conversationId, doc.id, true);
      setBotState(conversationId, "COLLECTING_NAME", {}, null);
      const deal = getOrCreateDeal(conversationId);
      updateDealStage(deal.id, "NUEVO");
      await botSend(sock, jid, phone, conversationId,
        `¡Perfecto! Gracias por aceptar. ¿Cuál es tu nombre completo?`
      );
    } else if (isNo(text)) {
      if (doc) logConsent(conversationId, doc.id, false);
      setBotOptOut(conversationId);
      const deal = getOrCreateDeal(conversationId);
      updateDealStage(deal.id, "PERDIDO", "Rechazó política de datos");
      await botSend(sock, jid, phone, conversationId,
        `Entendido. Sin tu autorización no podemos continuar. Si cambias de opinión, escríbenos nuevamente. ¡Hasta pronto!`
      );
    } else {
      await botSend(sock, jid, phone, conversationId,
        `Por favor responde *SI* para aceptar o *NO* para rechazar la política de tratamiento de datos.`
      );
    }
    return;
  }

  // ── COLLECTING_NAME ───────────────────────────────────────────────────
  if (currentState === "COLLECTING_NAME") {
    const name = text.trim();
    upsertContact(conversationId, { full_name: name });
    getOrCreateConversation(phone, name);
    setBotState(conversationId, "COLLECTING_EMAIL", { ...stateData, full_name: name }, null);
    await botSend(sock, jid, phone, conversationId,
      `Mucho gusto, *${name}*! ¿Cuál es tu correo electrónico para enviarte información?`
    );
    return;
  }

  // ── COLLECTING_EMAIL ──────────────────────────────────────────────────
  if (currentState === "COLLECTING_EMAIL") {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) {
      await botSend(sock, jid, phone, conversationId,
        `No reconozco ese correo. Por favor ingresa un email válido (ej: nombre@correo.com)`
      );
      return;
    }
    const email = emailMatch[0].toLowerCase();
    upsertContact(conversationId, { email });
    setBotState(conversationId, "COLLECTING_INTEREST", { ...stateData, email }, null);
    await botSend(sock, jid, phone, conversationId,
      `¡Perfecto! ¿En qué tipo de servicio o destino estás interesado? Cuéntame un poco qué tienes en mente. 🌍`
    );
    return;
  }

  // ── COLLECTING_INTEREST ───────────────────────────────────────────────
  if (currentState === "COLLECTING_INTEREST") {
    upsertContact(conversationId, { interest: text.trim() });
    setBotState(conversationId, "COLLECTING_BUDGET", { ...stateData, interest: text.trim() }, null);
    const deal = getOrCreateDeal(conversationId);
    updateDealStage(deal.id, "CALIFICADO");
    await botSend(sock, jid, phone, conversationId,
      `¡Excelente! ¿Cuál es tu presupuesto aproximado? (puedes indicarlo en COP o USD)`
    );
    return;
  }

  // ── COLLECTING_BUDGET ─────────────────────────────────────────────────
  if (currentState === "COLLECTING_BUDGET") {
    upsertContact(conversationId, { budget: text.trim() });
    setBotState(conversationId, "COLLECTING_DATE", { ...stateData, budget: text.trim() }, null);
    await botSend(sock, jid, phone, conversationId,
      `¿Para cuándo tienes planeado realizar el viaje o evento? (fecha aproximada)`
    );
    return;
  }

  // ── COLLECTING_DATE ───────────────────────────────────────────────────
  if (currentState === "COLLECTING_DATE") {
    upsertContact(conversationId, { travel_date: text.trim() });
    setBotState(conversationId, "BROWSING", { ...stateData, travel_date: text.trim() }, null);

    const products = listProducts(true);
    if (products.length === 0) {
      await botSend(sock, jid, phone, conversationId,
        `Gracias por la información. Un asesor de *${companyName}* te contactará pronto con opciones personalizadas.`
      );
      return;
    }

    const productList = products.map((p, i) =>
      `${i + 1}. *${p.name}* — $${p.price_per_person.toLocaleString("es-CO")} por persona`
    ).join("\n");

    await botSendMany(sock, jid, phone, conversationId, [
      `¡Perfecto! Aquí están nuestros servicios disponibles:\n\n${productList}`,
      `¿Cuál te llama la atención? Escribe el nombre o el número, o hazme preguntas sobre cualquiera de ellos. 😊`,
    ]);
    return;
  }

  // ── BROWSING ──────────────────────────────────────────────────────────
  if (currentState === "BROWSING") {
    const products = listProducts(true);
    const selected = detectProductSelection(text, products);

    if (selected) {
      setBotState(conversationId, "COLLECTING_PEOPLE", stateData, selected.id);
      const deal = getOrCreateDeal(conversationId);
      updateDealStage(deal.id, "PROPUESTA");

      // Enviar fotos del producto si tiene
      const caption = `*${selected.name}*\n$${selected.price_per_person.toLocaleString("es-CO")} por persona${selected.description ? `\n\n${selected.description}` : ""}`;
      await botSendProductImages(sock, jid, phone, conversationId, selected.id, caption);

      // Texto de seguimiento
      await botSend(sock, jid, phone, conversationId,
        `¡Excelente elección! ¿Para cuántas personas necesitas este servicio?`
      );
      return;
    }

    const reply = await generateStructuredReply(history, "BROWSING", { products, companyName, collectedData: stateData });
    if (isUncertainResponse(reply)) {
      insertJulietaAlert(conversationId, text, reply);
    }
    await botSend(sock, jid, phone, conversationId, reply);
    return;
  }

  // ── COLLECTING_PEOPLE ─────────────────────────────────────────────────
  if (currentState === "COLLECTING_PEOPLE") {
    const numMatch = text.match(/\d+/);
    if (!numMatch) {
      await botSend(sock, jid, phone, conversationId, `¿Para cuántas personas? Por favor indícame un número.`);
      return;
    }
    const people    = parseInt(numMatch[0]);
    const productId = getBotState(conversationId)?.selected_product_id;
    if (!productId) { setBotState(conversationId, "BROWSING", stateData, null); return; }

    const product = getProductById(productId)!;
    const total   = product.price_per_person * people;

    upsertContact(conversationId, { people_count: people });
    const deal = getOrCreateDeal(conversationId);
    updateDealProduct(deal.id, productId, people, total);

    const banks    = listBankAccounts().filter((b) => b.active);
    const bankInfo = banks.length > 0
      ? banks.map((b) =>
          `🏦 *${b.bank_name}*\n  Tipo: ${b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"}\n  Número: ${b.account_number}${b.account_holder ? `\n  A nombre de: ${b.account_holder}` : ""}`
        ).join("\n\n")
      : "_(Configura tus datos bancarios en Ajustes)_";

    setBotState(conversationId, "QUOTE_SENT", { ...stateData, people_count: people, product_id: productId, total }, productId);
    updateDealStage(deal.id, "PROPUESTA");

    await botSendMany(sock, jid, phone, conversationId, [
      `🎯 *Cotización*\n\n📦 Servicio: ${product.name}\n👥 Personas: ${people}\n💰 Total: $${total.toLocaleString("es-CO")} COP`,
      `Para confirmar tu reserva, realiza el pago a:\n\n${bankInfo}\n\n✅ Una vez realizado el pago, envíanos el comprobante por este chat.`,
    ]);
    return;
  }

  // ── QUOTE_SENT ────────────────────────────────────────────────────────
  if (currentState === "QUOTE_SENT") {
    const pid = getBotState(conversationId)?.selected_product_id ?? null;
    setBotState(conversationId, "AWAITING_PAYMENT", stateData, pid);
    const deal = getOrCreateDeal(conversationId);
    updateDealStage(deal.id, "NEGOCIACION");
    await botSend(sock, jid, phone, conversationId,
      `¡Gracias! Hemos recibido tu mensaje. Un asesor verificará tu pago y confirmará tu reserva en breve. 🙏`
    );
    return;
  }

  // ── AWAITING_PAYMENT ──────────────────────────────────────────────────
  if (currentState === "AWAITING_PAYMENT") {
    await botSend(sock, jid, phone, conversationId,
      `Ya tenemos tu solicitud. Estamos verificando tu pago y te confirmaremos muy pronto. ¿Tienes alguna otra pregunta?`
    );
    return;
  }

  // ── DONE / fallback ───────────────────────────────────────────────────
  const reply = await generateStructuredReply(history, currentState, { companyName });
  if (isUncertainResponse(reply)) {
    insertJulietaAlert(conversationId, text, reply);
  }
  await botSend(sock, jid, phone, conversationId, reply);
}

function detectProductSelection(
  text: string,
  products: { id: number; name: string; price_per_person: number; description: string | null }[]
) {
  const lower = text.toLowerCase().trim();
  const numOnly = text.match(/^\s*(\d+)\s*$/);
  if (numOnly) {
    const idx = parseInt(numOnly[1]) - 1;
    if (idx >= 0 && idx < products.length) return products[idx];
  }
  return products.find((p) => lower.includes(p.name.toLowerCase().slice(0, 5))) ?? null;
}
