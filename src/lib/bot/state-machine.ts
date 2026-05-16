import type { WASocket } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getCompanyDb } from "../master/db-company";
import { generateStructuredReply, isUncertainResponse } from "../openrouter";
import { sendWithAntiBlock, sendMultipleWithAntiBlock, isOptOutMessage, isWithinBusinessHours } from "./anti-block";

type BotState =
  | "INIT" | "CONSENT_PENDING" | "CONSENT_REJECTED"
  | "COLLECTING_NAME" | "COLLECTING_EMAIL" | "COLLECTING_INTEREST"
  | "COLLECTING_BUDGET" | "COLLECTING_DATE"
  | "BROWSING" | "PRODUCT_SELECTED" | "COLLECTING_PEOPLE"
  | "QUOTE_SENT" | "AWAITING_PAYMENT" | "DONE";

const CONSENT_KEYWORDS_YES = ["si","sí","acepto","ok","yes","claro","dale","de acuerdo","correcto","adelante"];
const CONSENT_KEYWORDS_NO  = ["no","rechazo","no acepto","nope"];
const GREETING_KEYWORDS    = ["hola","hello","buenas","buenos días","buenas tardes","buenas noches","hi","hey","buen día"];

function isYes(text: string)      { return CONSENT_KEYWORDS_YES.some(k => text.toLowerCase().trim().includes(k)); }
function isNo(text: string)       { return CONSENT_KEYWORDS_NO.some(k  => text.toLowerCase().trim() === k); }
function isGreeting(text: string) { return GREETING_KEYWORDS.some(k    => text.toLowerCase().trim().startsWith(k)); }
void isGreeting; // suppress unused

// ── DB helpers ────────────────────────────────────────────────────────────────

function insertMsg(db: Database.Database, convId: number, role: string, content: string) {
  db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(convId, role, content);
}

function getBotState(db: Database.Database, convId: number) {
  return db.prepare("SELECT * FROM bot_conversation_state WHERE conversation_id=?")
    .get(convId) as { state: string; data: string; selected_product_id: number | null; opted_out: number } | null;
}

function setBotState(db: Database.Database, convId: number, state: BotState, data: Record<string, unknown> = {}, productId: number | null = null) {
  db.prepare(`
    INSERT INTO bot_conversation_state (conversation_id, state, data, selected_product_id)
    VALUES (?,?,?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      state=excluded.state, data=excluded.data,
      selected_product_id=excluded.selected_product_id, updated_at=unixepoch()
  `).run(convId, state, JSON.stringify(data), productId);
}

function getOrCreateDeal(db: Database.Database, convId: number): { id: number } {
  const existing = db.prepare("SELECT id FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(convId) as { id: number } | null;
  if (existing) return existing;
  const contact = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(convId) as { id: number } | null;
  return db.prepare("INSERT INTO crm_deals (conversation_id, contact_id, stage) VALUES (?,?,?) RETURNING id")
    .get(convId, contact?.id ?? null, "NUEVO") as { id: number };
}

function upsertContact(db: Database.Database, convId: number, data: Record<string, unknown>) {
  const existing = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(convId) as { id: number } | null;
  if (existing) {
    const fields = Object.keys(data).map(k => `${k}=?`).join(",");
    const values = [...Object.values(data), existing.id];
    db.prepare(`UPDATE contacts SET ${fields}, updated_at=unixepoch() WHERE id=?`).run(...values);
  } else {
    const keys = ["conversation_id", ...Object.keys(data)].join(",");
    const placeholders = Array(Object.keys(data).length + 1).fill("?").join(",");
    db.prepare(`INSERT INTO contacts (${keys}) VALUES (${placeholders})`).run(convId, ...Object.values(data));
  }
}

// ── Bot message helpers ───────────────────────────────────────────────────────

async function botSend(db: Database.Database, sock: WASocket, jid: string, phone: string, convId: number, text: string) {
  insertMsg(db, convId, "assistant", text);
  await sendWithAntiBlock(sock, jid, text, phone);
}

async function botSendMany(db: Database.Database, sock: WASocket, jid: string, phone: string, convId: number, texts: string[]) {
  for (const t of texts) insertMsg(db, convId, "assistant", t);
  await sendMultipleWithAntiBlock(sock, jid, texts, phone);
}

async function botSendProductImages(db: Database.Database, sock: WASocket, jid: string, phone: string, convId: number, productId: number, caption: string) {
  const images = db.prepare("SELECT * FROM product_images WHERE product_id=? ORDER BY order_index").all(productId) as { filename: string }[];
  if (images.length === 0) return;
  const uploadsDir = path.resolve(process.cwd(), "public", "uploads", "products");
  for (let i = 0; i < images.length; i++) {
    const filePath = path.join(uploadsDir, images[i].filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const buffer = fs.readFileSync(filePath);
      await sock.sendMessage(jid, {
        image: buffer,
        caption: i === 0 ? caption : undefined,
        mimetype: images[i].filename.endsWith(".png") ? "image/png" : "image/jpeg",
      });
      db.prepare("INSERT INTO message_rate_log (phone) VALUES (?)").run(phone);
      if (i < images.length - 1) await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[bot] Error enviando imagen ${images[i].filename}:`, err);
    }
  }
}

function detectProductSelection(text: string, products: { id: number; name: string; price_per_person: number; description: string | null }[]) {
  const lower = text.toLowerCase().trim();
  const numOnly = text.match(/^\s*(\d+)\s*$/);
  if (numOnly) {
    const idx = parseInt(numOnly[1]) - 1;
    if (idx >= 0 && idx < products.length) return products[idx];
  }
  return products.find(p => lower.includes(p.name.toLowerCase().slice(0, 5))) ?? null;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function processBotMessage(
  sock: WASocket,
  conversationId: number,
  phone: string,
  jid: string,
  text: string,
  history: { role: string; content: string }[],
  slug = "platform"
): Promise<void> {
  const db = getCompanyDb(slug);

  const company = db.prepare("SELECT * FROM company_config WHERE id=1").get() as { name: string | null; business_hours_start: number; business_hours_end: number; business_days: string } | null;
  const companyName = company?.name ?? "nuestra empresa";

  let botState = getBotState(db, conversationId);

  // ── Reactivar conversación (opt-out o perdida) ────────────────────────
  if (botState?.opted_out) {
    db.prepare("UPDATE bot_conversation_state SET opted_out=0, state='BROWSING', updated_at=unixepoch() WHERE conversation_id=?").run(conversationId);
    botState = getBotState(db, conversationId);
    await botSend(db, sock, jid, phone, conversationId, `¡Hola de nuevo! Me alegra que vuelvas a escribirnos. ¿En qué puedo ayudarte hoy?`);
    return;
  }

  // ── Opt-out explícito ─────────────────────────────────────────────────
  if (isOptOutMessage(text)) {
    db.prepare("UPDATE bot_conversation_state SET opted_out=1 WHERE conversation_id=?").run(conversationId);
    const deal = getOrCreateDeal(db, conversationId);
    db.prepare("UPDATE crm_deals SET stage='PERDIDO', notes='Cliente solicitó no ser contactado' WHERE id=?").run(deal.id);
    await botSend(db, sock, jid, phone, conversationId, `Entendido. Hemos removido tus datos de nuestras comunicaciones. Si en el futuro deseas retomar el contacto, escríbenos. ¡Hasta pronto!`);
    return;
  }

  // ── Horario laboral ───────────────────────────────────────────────────
  if (!isWithinBusinessHours(company?.business_hours_start, company?.business_hours_end, company?.business_days)) {
    if (!botState || botState.state === "INIT") {
      await botSend(db, sock, jid, phone, conversationId, `Hola! Gracias por escribirnos a *${companyName}*. En este momento estamos fuera de horario de atención. Te responderemos pronto. ¡Hasta luego!`);
      setBotState(db, conversationId, "INIT");
    }
    return;
  }

  const currentState = (botState?.state ?? "INIT") as BotState;
  const stateData: Record<string, unknown> = botState?.data ? JSON.parse(botState.data) : {};

  // ── INIT ──────────────────────────────────────────────────────────────
  if (currentState === "INIT") {
    const doc = db.prepare("SELECT * FROM legal_documents WHERE type='data_treatment' AND active=1 ORDER BY id DESC LIMIT 1").get() as { id: number; title: string; content: string } | null;
    if (doc) {
      const summary = doc.content.slice(0, 400) + (doc.content.length > 400 ? "..." : "");
      await botSendMany(db, sock, jid, phone, conversationId, [
        `¡Hola! Bienvenido a *${companyName}* 👋`,
        `Antes de continuar, necesitamos tu autorización para tratar tus datos personales según la *Ley 1581 de 2012*.\n\n📄 *${doc.title}*\n\n${summary}\n\nResponde *SI* para aceptar o *NO* para rechazar.`,
      ]);
      setBotState(db, conversationId, "CONSENT_PENDING", {}, null);
      getOrCreateDeal(db, conversationId);
    } else {
      setBotState(db, conversationId, "COLLECTING_NAME", {}, null);
      const deal = getOrCreateDeal(db, conversationId);
      db.prepare("UPDATE crm_deals SET stage='NUEVO' WHERE id=?").run(deal.id);
      await botSend(db, sock, jid, phone, conversationId, `¡Hola! Bienvenido a *${companyName}*. Para atenderte mejor, ¿cuál es tu nombre completo?`);
    }
    return;
  }

  // ── CONSENT_PENDING ───────────────────────────────────────────────────
  if (currentState === "CONSENT_PENDING") {
    const doc = db.prepare("SELECT id FROM legal_documents WHERE type='data_treatment' AND active=1 ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
    if (isYes(text)) {
      if (doc) db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?,?,1)").run(conversationId, doc.id);
      setBotState(db, conversationId, "COLLECTING_NAME", {}, null);
      const deal = getOrCreateDeal(db, conversationId);
      db.prepare("UPDATE crm_deals SET stage='NUEVO' WHERE id=?").run(deal.id);
      await botSend(db, sock, jid, phone, conversationId, `¡Perfecto! Gracias por aceptar. ¿Cuál es tu nombre completo?`);
    } else if (isNo(text)) {
      if (doc) db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?,?,0)").run(conversationId, doc.id);
      db.prepare("UPDATE bot_conversation_state SET opted_out=1 WHERE conversation_id=?").run(conversationId);
      const deal = getOrCreateDeal(db, conversationId);
      db.prepare("UPDATE crm_deals SET stage='PERDIDO', notes='Rechazó política de datos' WHERE id=?").run(deal.id);
      await botSend(db, sock, jid, phone, conversationId, `Entendido. Sin tu autorización no podemos continuar. Si cambias de opinión, escríbenos nuevamente. ¡Hasta pronto!`);
    } else {
      await botSend(db, sock, jid, phone, conversationId, `Por favor responde *SI* para aceptar o *NO* para rechazar la política de tratamiento de datos.`);
    }
    return;
  }

  // ── COLLECTING_NAME ───────────────────────────────────────────────────
  if (currentState === "COLLECTING_NAME") {
    const name = text.trim();
    upsertContact(db, conversationId, { full_name: name });
    db.prepare("UPDATE conversations SET name=? WHERE phone=?").run(name, phone);
    setBotState(db, conversationId, "COLLECTING_EMAIL", { ...stateData, full_name: name }, null);
    await botSend(db, sock, jid, phone, conversationId, `Mucho gusto, *${name}*! ¿Cuál es tu correo electrónico para enviarte información?`);
    return;
  }

  // ── COLLECTING_EMAIL ──────────────────────────────────────────────────
  if (currentState === "COLLECTING_EMAIL") {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) {
      await botSend(db, sock, jid, phone, conversationId, `No reconozco ese correo. Por favor ingresa un email válido (ej: nombre@correo.com)`);
      return;
    }
    const email = emailMatch[0].toLowerCase();
    upsertContact(db, conversationId, { email });
    setBotState(db, conversationId, "COLLECTING_INTEREST", { ...stateData, email }, null);
    await botSend(db, sock, jid, phone, conversationId, `¡Perfecto! ¿En qué tipo de servicio o destino estás interesado? Cuéntame un poco qué tienes en mente. 🌍`);
    return;
  }

  // ── COLLECTING_INTEREST ───────────────────────────────────────────────
  if (currentState === "COLLECTING_INTEREST") {
    upsertContact(db, conversationId, { interest: text.trim() });
    setBotState(db, conversationId, "COLLECTING_BUDGET", { ...stateData, interest: text.trim() }, null);
    const deal = getOrCreateDeal(db, conversationId);
    db.prepare("UPDATE crm_deals SET stage='CALIFICADO' WHERE id=?").run(deal.id);
    await botSend(db, sock, jid, phone, conversationId, `¡Excelente! ¿Cuál es tu presupuesto aproximado? (puedes indicarlo en COP o USD)`);
    return;
  }

  // ── COLLECTING_BUDGET ─────────────────────────────────────────────────
  if (currentState === "COLLECTING_BUDGET") {
    upsertContact(db, conversationId, { budget: text.trim() });
    setBotState(db, conversationId, "COLLECTING_DATE", { ...stateData, budget: text.trim() }, null);
    await botSend(db, sock, jid, phone, conversationId, `¿Para cuándo tienes planeado realizar el viaje o evento? (fecha aproximada)`);
    return;
  }

  // ── COLLECTING_DATE ───────────────────────────────────────────────────
  if (currentState === "COLLECTING_DATE") {
    upsertContact(db, conversationId, { travel_date: text.trim() });
    setBotState(db, conversationId, "BROWSING", { ...stateData, travel_date: text.trim() }, null);

    const products = db.prepare("SELECT * FROM products WHERE active=1").all() as { id: number; name: string; price_per_person: number; description: string | null }[];
    if (products.length === 0) {
      await botSend(db, sock, jid, phone, conversationId, `Gracias por la información. Un asesor de *${companyName}* te contactará pronto con opciones personalizadas.`);
      return;
    }
    const productList = products.map((p, i) => `${i + 1}. *${p.name}* — $${p.price_per_person.toLocaleString("es-CO")} por persona`).join("\n");
    await botSendMany(db, sock, jid, phone, conversationId, [
      `¡Perfecto! Aquí están nuestros servicios disponibles:\n\n${productList}`,
      `¿Cuál te llama la atención? Escribe el nombre o el número, o hazme preguntas. 😊`,
    ]);
    return;
  }

  // ── BROWSING ──────────────────────────────────────────────────────────
  if (currentState === "BROWSING") {
    const products = db.prepare("SELECT * FROM products WHERE active=1").all() as { id: number; name: string; price_per_person: number; description: string | null }[];
    const selected = detectProductSelection(text, products);

    if (selected) {
      setBotState(db, conversationId, "COLLECTING_PEOPLE", stateData, selected.id);
      const deal = getOrCreateDeal(db, conversationId);
      db.prepare("UPDATE crm_deals SET stage='PROPUESTA' WHERE id=?").run(deal.id);
      const caption = `*${selected.name}*\n$${selected.price_per_person.toLocaleString("es-CO")} por persona${selected.description ? `\n\n${selected.description}` : ""}`;
      await botSendProductImages(db, sock, jid, phone, conversationId, selected.id, caption);
      await botSend(db, sock, jid, phone, conversationId, `¡Excelente elección! ¿Para cuántas personas necesitas este servicio?`);
      return;
    }

    const reply = await generateStructuredReply(history, "BROWSING", { products, companyName, collectedData: stateData }, slug);
    if (isUncertainResponse(reply)) {
      db.prepare("INSERT INTO julieta_alerts (conversation_id, question, julieta_response) VALUES (?,?,?)").run(conversationId, text, reply);
    }
    await botSend(db, sock, jid, phone, conversationId, reply);
    return;
  }

  // ── COLLECTING_PEOPLE ─────────────────────────────────────────────────
  if (currentState === "COLLECTING_PEOPLE") {
    const numMatch = text.match(/\d+/);
    if (!numMatch) {
      await botSend(db, sock, jid, phone, conversationId, `¿Para cuántas personas? Por favor indícame un número.`);
      return;
    }
    const people    = parseInt(numMatch[0]);
    const productId = getBotState(db, conversationId)?.selected_product_id;
    if (!productId) { setBotState(db, conversationId, "BROWSING", stateData, null); return; }

    const product = db.prepare("SELECT * FROM products WHERE id=?").get(productId) as { id: number; name: string; price_per_person: number } | null;
    if (!product) { setBotState(db, conversationId, "BROWSING", stateData, null); return; }
    const total = product.price_per_person * people;

    upsertContact(db, conversationId, { people_count: people });
    const deal = getOrCreateDeal(db, conversationId);
    db.prepare("UPDATE crm_deals SET product_id=?, people_count=?, total_value=? WHERE id=?").run(productId, people, total, deal.id);

    const banks = db.prepare("SELECT * FROM bank_accounts WHERE active=1").all() as { bank_name: string; account_type: string; account_number: string; account_holder: string | null }[];
    const bankInfo = banks.length > 0
      ? banks.map(b => `🏦 *${b.bank_name}*\n  Tipo: ${b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"}\n  Número: ${b.account_number}${b.account_holder ? `\n  A nombre de: ${b.account_holder}` : ""}`).join("\n\n")
      : "_(Configura tus datos bancarios en Ajustes)_";

    setBotState(db, conversationId, "QUOTE_SENT", { ...stateData, people_count: people, product_id: productId, total }, productId);
    db.prepare("UPDATE crm_deals SET stage='PROPUESTA' WHERE id=?").run(deal.id);

    await botSendMany(db, sock, jid, phone, conversationId, [
      `🎯 *Cotización*\n\n📦 Servicio: ${product.name}\n👥 Personas: ${people}\n💰 Total: $${total.toLocaleString("es-CO")} COP`,
      `Para confirmar tu reserva, realiza el pago a:\n\n${bankInfo}\n\n✅ Una vez realizado el pago, envíanos el comprobante por este chat.`,
    ]);
    return;
  }

  // ── QUOTE_SENT ────────────────────────────────────────────────────────
  if (currentState === "QUOTE_SENT") {
    const pid = getBotState(db, conversationId)?.selected_product_id ?? null;
    setBotState(db, conversationId, "AWAITING_PAYMENT", stateData, pid);
    const deal = getOrCreateDeal(db, conversationId);
    db.prepare("UPDATE crm_deals SET stage='NEGOCIACION' WHERE id=?").run(deal.id);
    await botSend(db, sock, jid, phone, conversationId, `¡Gracias! Hemos recibido tu mensaje. Un asesor verificará tu pago y confirmará tu reserva en breve. 🙏`);
    return;
  }

  // ── AWAITING_PAYMENT ──────────────────────────────────────────────────
  if (currentState === "AWAITING_PAYMENT") {
    await botSend(db, sock, jid, phone, conversationId, `Ya tenemos tu solicitud. Estamos verificando tu pago y te confirmaremos muy pronto. ¿Tienes alguna otra pregunta?`);
    return;
  }

  // ── DONE / fallback ───────────────────────────────────────────────────
  const reply = await generateStructuredReply(history, currentState, { companyName }, slug);
  if (isUncertainResponse(reply)) {
    db.prepare("INSERT INTO julieta_alerts (conversation_id, question, julieta_response) VALUES (?,?,?)").run(conversationId, text, reply);
  }
  await botSend(db, sock, jid, phone, conversationId, reply);
}
