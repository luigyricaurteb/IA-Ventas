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

const YES_KW = ["si","sí","acepto","ok","yes","claro","dale","de acuerdo","correcto","adelante","afirmativo","exacto"];
const NO_KW  = ["no","rechazo","no acepto","nope","negativo"];

function isYes(t: string) { return YES_KW.some(k => t.toLowerCase().trim().includes(k)); }
function isNo(t: string)  { return NO_KW.some(k  => t.toLowerCase().trim() === k); }

// ── DB helpers ────────────────────────────────────────────────────────────────

function msg(db: Database.Database, convId: number, role: string, text: string) {
  try { db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(convId, role, text); } catch {}
}

function getBotState(db: Database.Database, convId: number) {
  return db.prepare("SELECT * FROM bot_conversation_state WHERE conversation_id=?")
    .get(convId) as { state: string; data: string; selected_product_id: number | null; opted_out: number } | null;
}

function setBotState(
  db: Database.Database, convId: number, state: BotState,
  data: Record<string, unknown> = {}, productId: number | null = null
) {
  try {
    db.prepare(`
      INSERT INTO bot_conversation_state (conversation_id, state, data, selected_product_id)
      VALUES (?,?,?,?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        state=excluded.state, data=excluded.data,
        selected_product_id=excluded.selected_product_id, updated_at=unixepoch()
    `).run(convId, state, JSON.stringify(data), productId);
  } catch (e) {
    console.error("[state] Error setBotState:", e);
  }
}

function getDeal(db: Database.Database, convId: number): { id: number } | null {
  return db.prepare("SELECT id FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(convId) as { id: number } | null;
}

function getOrCreateDeal(db: Database.Database, convId: number): { id: number } {
  const existing = getDeal(db, convId);
  if (existing) return existing;
  try {
    const contact = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(convId) as { id: number } | null;
    const row = db.prepare(
      "INSERT INTO crm_deals (conversation_id, contact_id, stage) VALUES (?,?,?) RETURNING id"
    ).get(convId, contact?.id ?? null, "NUEVO") as { id: number } | null;
    return row ?? { id: 0 };
  } catch (e) {
    console.error("[state] Error getOrCreateDeal:", e);
    return { id: 0 };
  }
}

function upsertContact(db: Database.Database, convId: number, data: Record<string, unknown>) {
  try {
    const existing = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(convId) as { id: number } | null;
    if (existing) {
      const fields = Object.keys(data).map(k => `${k}=?`).join(",");
      db.prepare(`UPDATE contacts SET ${fields}, updated_at=unixepoch() WHERE id=?`).run(...Object.values(data), existing.id);
    } else {
      const keys = ["conversation_id", ...Object.keys(data)].join(",");
      const ph   = Array(Object.keys(data).length + 1).fill("?").join(",");
      db.prepare(`INSERT INTO contacts (${keys}) VALUES (${ph})`).run(convId, ...Object.values(data));
    }
  } catch (e) {
    console.error("[state] Error upsertContact:", e);
  }
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function botSend(
  db: Database.Database, sock: WASocket, jid: string,
  phone: string, convId: number, text: string
): Promise<void> {
  msg(db, convId, "assistant", text);
  await sendWithAntiBlock(sock, jid, text, phone);
}

async function botSendMany(
  db: Database.Database, sock: WASocket, jid: string,
  phone: string, convId: number, texts: string[]
): Promise<void> {
  for (const t of texts) msg(db, convId, "assistant", t);
  await sendMultipleWithAntiBlock(sock, jid, texts, phone);
}

async function botSendProductImages(
  db: Database.Database, sock: WASocket, jid: string,
  phone: string, convId: number, productId: number, caption: string
): Promise<void> {
  const images = db.prepare(
    "SELECT * FROM product_images WHERE product_id=? ORDER BY order_index ASC"
  ).all(productId) as { filename: string }[];
  if (images.length === 0) return;
  const dir = path.resolve(process.cwd(), "public", "uploads", "products");
  for (let i = 0; i < images.length; i++) {
    const fp = path.join(dir, images[i].filename);
    if (!fs.existsSync(fp)) continue;
    try {
      const buffer = fs.readFileSync(fp);
      await sock.sendMessage(jid, {
        image: buffer,
        caption: i === 0 ? caption : undefined,
        mimetype: images[i].filename.endsWith(".png") ? "image/png" : "image/jpeg",
      });
      if (i < images.length - 1) await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error(`[bot] Error enviando imagen:`, e);
    }
  }
}

function detectProduct(text: string, products: { id: number; name: string; price_per_person: number; description: string | null }[]) {
  const lower = text.toLowerCase().trim();
  const num = text.match(/^\s*(\d+)\s*$/);
  if (num) {
    const idx = parseInt(num[1]) - 1;
    if (idx >= 0 && idx < products.length) return products[idx];
  }
  return products.find(p => lower.includes(p.name.toLowerCase().substring(0, 5))) ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

  console.log(`[bot:${slug}] processBotMessage convId=${conversationId} text="${text.slice(0, 60)}"`);

  // Config de la empresa
  const cfg = db.prepare("SELECT * FROM company_config WHERE id=1").get() as {
    name: string | null; ai_name: string | null;
    business_hours_start: number | null; business_hours_end: number | null;
    business_days: string | null;
  } | null;

  const companyName = cfg?.name ?? "nuestra empresa";
  const startH = cfg?.business_hours_start ?? 8;
  const endH   = cfg?.business_hours_end   ?? 20;
  const bDays  = cfg?.business_days        ?? "1,2,3,4,5,6";

  let botState = getBotState(db, conversationId);
  console.log(`[bot:${slug}] Estado actual: ${botState?.state ?? "null (INIT)"}, opted_out: ${botState?.opted_out ?? 0}`);

  // ── Reactivar opt-out ────────────────────────────────────────────────
  if (botState?.opted_out) {
    db.prepare("UPDATE bot_conversation_state SET opted_out=0, state='BROWSING', updated_at=unixepoch() WHERE conversation_id=?").run(conversationId);
    botState = getBotState(db, conversationId);
    await botSend(db, sock, jid, phone, conversationId,
      `¡Hola de nuevo! 👋 Me alegra volverte a ver. ¿En qué puedo ayudarte hoy?`
    );
    return;
  }

  // ── Opt-out explícito ────────────────────────────────────────────────
  if (isOptOutMessage(text)) {
    db.prepare(`
      INSERT INTO bot_conversation_state (conversation_id, opted_out, state)
      VALUES (?,1,'CONSENT_REJECTED')
      ON CONFLICT(conversation_id) DO UPDATE SET opted_out=1, state='CONSENT_REJECTED', updated_at=unixepoch()
    `).run(conversationId);
    const deal = getDeal(db, conversationId);
    if (deal?.id) db.prepare("UPDATE crm_deals SET stage='PERDIDO' WHERE id=?").run(deal.id);
    await botSend(db, sock, jid, phone, conversationId,
      `Entendido. Hemos eliminado tus datos de nuestras comunicaciones. Si en el futuro deseas retomar el contacto, escríbenos. ¡Hasta pronto!`
    );
    return;
  }

  // ── Horario laboral (UTC-5 Colombia) ─────────────────────────────────
  const withinHours = isWithinBusinessHours(startH, endH, bDays, -5);
  console.log(`[bot:${slug}] Dentro de horario: ${withinHours} (${startH}h-${endH}h días:${bDays})`);

  if (!withinHours) {
    // Siempre responder cuando es primer mensaje o estado INIT
    if (!botState || botState.state === "INIT") {
      await botSend(db, sock, jid, phone, conversationId,
        `¡Hola! Gracias por contactar a *${companyName}*. En este momento estamos fuera de horario de atención.\n\nNuestro horario es de ${startH}:00 a ${endH}:00 horas. ¡Te atenderemos tan pronto como estemos disponibles! 🙌`
      );
      setBotState(db, conversationId, "INIT");
    } else {
      // Fuera de horario pero con conversación activa — recordar horario
      await botSend(db, sock, jid, phone, conversationId,
        `📴 Estamos fuera de horario de atención (${startH}:00 - ${endH}:00). ¡Continuaremos atendiéndote cuando regresemos! 🙌`
      );
    }
    return;
  }

  // ── Dentro de horario: procesar estado ───────────────────────────────
  const currentState = (botState?.state ?? "INIT") as BotState;
  const stateData: Record<string, unknown> = (() => {
    try { return botState?.data ? JSON.parse(botState.data) : {}; }
    catch { return {}; }
  })();

  console.log(`[bot:${slug}] Procesando estado: ${currentState}`);

  // INIT
  if (currentState === "INIT") {
    const doc = db.prepare(
      "SELECT * FROM legal_documents WHERE type='data_treatment' AND active=1 ORDER BY id DESC LIMIT 1"
    ).get() as { id: number; title: string; content: string } | null;

    if (doc) {
      const summary = doc.content.slice(0, 350) + (doc.content.length > 350 ? "..." : "");
      await botSendMany(db, sock, jid, phone, conversationId, [
        `¡Hola! Bienvenido/a a *${companyName}* 👋`,
        `Antes de continuar, necesito tu autorización para el tratamiento de datos personales (Ley 1581 de 2012).\n\n📄 *${doc.title}*\n\n${summary}\n\nResponde *SI* para aceptar o *NO* para rechazar.`,
      ]);
      setBotState(db, conversationId, "CONSENT_PENDING");
      getOrCreateDeal(db, conversationId);
    } else {
      setBotState(db, conversationId, "COLLECTING_NAME");
      const deal = getOrCreateDeal(db, conversationId);
      if (deal.id) db.prepare("UPDATE crm_deals SET stage='NUEVO' WHERE id=?").run(deal.id);
      await botSend(db, sock, jid, phone, conversationId,
        `¡Hola! Bienvenido/a a *${companyName}* 👋\n¿Con quién tengo el gusto? ¿Cuál es tu nombre completo?`
      );
    }
    return;
  }

  // CONSENT_PENDING
  if (currentState === "CONSENT_PENDING") {
    const doc = db.prepare("SELECT id FROM legal_documents WHERE type='data_treatment' AND active=1 ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
    if (isYes(text)) {
      if (doc) db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?,?,1)").run(conversationId, doc.id);
      setBotState(db, conversationId, "COLLECTING_NAME");
      const deal = getOrCreateDeal(db, conversationId);
      if (deal.id) db.prepare("UPDATE crm_deals SET stage='NUEVO' WHERE id=?").run(deal.id);
      await botSend(db, sock, jid, phone, conversationId, `¡Perfecto! Gracias por aceptar. ¿Cuál es tu nombre completo?`);
    } else if (isNo(text)) {
      if (doc) db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?,?,0)").run(conversationId, doc.id);
      db.prepare(`INSERT INTO bot_conversation_state (conversation_id, opted_out, state) VALUES (?,1,'CONSENT_REJECTED')
        ON CONFLICT(conversation_id) DO UPDATE SET opted_out=1, state='CONSENT_REJECTED', updated_at=unixepoch()`).run(conversationId);
      const deal = getOrCreateDeal(db, conversationId);
      if (deal.id) db.prepare("UPDATE crm_deals SET stage='PERDIDO' WHERE id=?").run(deal.id);
      await botSend(db, sock, jid, phone, conversationId,
        `Entendido. Sin tu autorización no podemos continuar. Si cambias de opinión, escríbenos. ¡Hasta pronto!`
      );
    } else {
      await botSend(db, sock, jid, phone, conversationId,
        `Por favor responde *SI* para aceptar o *NO* para rechazar la política de tratamiento de datos.`
      );
    }
    return;
  }

  // COLLECTING_NAME
  if (currentState === "COLLECTING_NAME") {
    const name = text.trim();
    upsertContact(db, conversationId, { full_name: name });
    db.prepare("UPDATE conversations SET name=? WHERE phone=?").run(name, phone);
    setBotState(db, conversationId, "COLLECTING_EMAIL", { ...stateData, full_name: name });
    await botSend(db, sock, jid, phone, conversationId,
      `Mucho gusto, *${name}*! ¿Cuál es tu correo electrónico para enviarte información?`
    );
    return;
  }

  // COLLECTING_EMAIL
  if (currentState === "COLLECTING_EMAIL") {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) {
      await botSend(db, sock, jid, phone, conversationId,
        `No reconozco ese correo. Por favor ingresa un email válido (ej: nombre@correo.com)`
      );
      return;
    }
    const email = emailMatch[0].toLowerCase();
    upsertContact(db, conversationId, { email });
    setBotState(db, conversationId, "COLLECTING_INTEREST", { ...stateData, email });
    await botSend(db, sock, jid, phone, conversationId,
      `¡Perfecto! ¿Qué tipo de servicio o destino te interesa? Cuéntame un poco. 🌍`
    );
    return;
  }

  // COLLECTING_INTEREST
  if (currentState === "COLLECTING_INTEREST") {
    upsertContact(db, conversationId, { interest: text.trim() });
    const deal = getOrCreateDeal(db, conversationId);
    if (deal.id) db.prepare("UPDATE crm_deals SET stage='CALIFICADO' WHERE id=?").run(deal.id);
    setBotState(db, conversationId, "COLLECTING_BUDGET", { ...stateData, interest: text.trim() });
    await botSend(db, sock, jid, phone, conversationId,
      `¡Excelente! ¿Cuál es tu presupuesto aproximado? (en COP o USD)`
    );
    return;
  }

  // COLLECTING_BUDGET
  if (currentState === "COLLECTING_BUDGET") {
    upsertContact(db, conversationId, { budget: text.trim() });
    setBotState(db, conversationId, "COLLECTING_DATE", { ...stateData, budget: text.trim() });
    await botSend(db, sock, jid, phone, conversationId,
      `¿Para cuándo tienes planeado realizar el viaje o servicio? (fecha aproximada)`
    );
    return;
  }

  // COLLECTING_DATE
  if (currentState === "COLLECTING_DATE") {
    upsertContact(db, conversationId, { travel_date: text.trim() });
    setBotState(db, conversationId, "BROWSING", { ...stateData, travel_date: text.trim() });

    const products = db.prepare("SELECT id, name, price_per_person, description FROM products WHERE active=1").all() as {
      id: number; name: string; price_per_person: number; description: string | null;
    }[];
    if (products.length === 0) {
      await botSend(db, sock, jid, phone, conversationId,
        `Gracias por la información. Un asesor de *${companyName}* te contactará pronto con opciones personalizadas.`
      );
      return;
    }
    const list = products.map((p, i) =>
      `${i + 1}. *${p.name}* — $${p.price_per_person.toLocaleString("es-CO")} por persona`
    ).join("\n");
    await botSendMany(db, sock, jid, phone, conversationId, [
      `¡Perfecto! Aquí nuestros servicios disponibles:\n\n${list}`,
      `¿Cuál te llama la atención? Escribe el nombre o el número. 😊`,
    ]);
    return;
  }

  // BROWSING
  if (currentState === "BROWSING") {
    const products = db.prepare("SELECT id, name, price_per_person, description FROM products WHERE active=1").all() as {
      id: number; name: string; price_per_person: number; description: string | null;
    }[];
    const selected = detectProduct(text, products);

    if (selected) {
      setBotState(db, conversationId, "COLLECTING_PEOPLE", stateData, selected.id);
      const deal = getOrCreateDeal(db, conversationId);
      if (deal.id) db.prepare("UPDATE crm_deals SET stage='PROPUESTA', product_id=? WHERE id=?").run(selected.id, deal.id);
      const caption = `*${selected.name}*\n$${selected.price_per_person.toLocaleString("es-CO")} por persona${selected.description ? `\n\n${selected.description}` : ""}`;
      await botSendProductImages(db, sock, jid, phone, conversationId, selected.id, caption);
      await botSend(db, sock, jid, phone, conversationId, `¡Excelente elección! ¿Para cuántas personas necesitas este servicio?`);
      return;
    }

    const reply = await generateStructuredReply(history, "BROWSING", { products, companyName, collectedData: stateData }, slug);
    if (isUncertainResponse(reply)) {
      try { db.prepare("INSERT INTO julieta_alerts (conversation_id, question, julieta_response) VALUES (?,?,?)").run(conversationId, text, reply); } catch {}
    }
    await botSend(db, sock, jid, phone, conversationId, reply);
    return;
  }

  // COLLECTING_PEOPLE
  if (currentState === "COLLECTING_PEOPLE") {
    const numMatch = text.match(/\d+/);
    if (!numMatch) {
      await botSend(db, sock, jid, phone, conversationId, `¿Para cuántas personas? Por favor indícame un número.`);
      return;
    }
    const people    = parseInt(numMatch[0]);
    const bs        = getBotState(db, conversationId);
    const productId = bs?.selected_product_id;
    if (!productId) { setBotState(db, conversationId, "BROWSING", stateData, null); return; }

    const product = db.prepare("SELECT id, name, price_per_person FROM products WHERE id=?").get(productId) as { id: number; name: string; price_per_person: number } | null;
    if (!product) { setBotState(db, conversationId, "BROWSING", stateData, null); return; }
    const total = product.price_per_person * people;

    upsertContact(db, conversationId, { people_count: people });
    const deal = getOrCreateDeal(db, conversationId);
    if (deal.id) db.prepare("UPDATE crm_deals SET product_id=?, people_count=?, total_value=?, stage='PROPUESTA' WHERE id=?").run(productId, people, total, deal.id);

    const banks = db.prepare("SELECT * FROM bank_accounts WHERE active=1").all() as { bank_name: string; account_type: string; account_number: string; account_holder: string | null }[];
    const bankInfo = banks.length > 0
      ? banks.map(b => `🏦 *${b.bank_name}*\n  ${b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"}: ${b.account_number}${b.account_holder ? `\n  A nombre de: ${b.account_holder}` : ""}`).join("\n\n")
      : "_Configura tus datos bancarios en Ajustes → Cuentas bancarias_";

    setBotState(db, conversationId, "QUOTE_SENT", { ...stateData, people_count: people, total }, productId);
    await botSendMany(db, sock, jid, phone, conversationId, [
      `🎯 *Tu cotización*\n\n📦 *${product.name}*\n👥 ${people} persona${people !== 1 ? "s" : ""}\n💰 Total: $${total.toLocaleString("es-CO")} COP`,
      `Para confirmar tu reserva, realiza el pago a:\n\n${bankInfo}\n\n✅ Cuando hayas pagado, envíanos el comprobante por este chat.`,
    ]);
    return;
  }

  // QUOTE_SENT
  if (currentState === "QUOTE_SENT") {
    const bs = getBotState(db, conversationId);
    setBotState(db, conversationId, "AWAITING_PAYMENT", stateData, bs?.selected_product_id ?? null);
    const deal = getDeal(db, conversationId);
    if (deal?.id) db.prepare("UPDATE crm_deals SET stage='NEGOCIACION' WHERE id=?").run(deal.id);
    await botSend(db, sock, jid, phone, conversationId,
      `¡Gracias! Hemos registrado tu mensaje. Un asesor verificará tu pago y te confirmará la reserva. 🙏`
    );
    return;
  }

  // AWAITING_PAYMENT
  if (currentState === "AWAITING_PAYMENT") {
    await botSend(db, sock, jid, phone, conversationId,
      `Estamos verificando tu pago. Te confirmaremos la reserva pronto. ¿Tienes alguna otra pregunta?`
    );
    return;
  }

  // DONE / fallback — responde con IA siempre
  console.log(`[bot:${slug}] Estado ${currentState} → usando IA como fallback`);
  try {
    const reply = await generateStructuredReply(history, currentState, { companyName }, slug);
    if (isUncertainResponse(reply)) {
      try { db.prepare("INSERT INTO julieta_alerts (conversation_id, question, julieta_response) VALUES (?,?,?)").run(conversationId, text, reply); } catch {}
    }
    await botSend(db, sock, jid, phone, conversationId, reply);
  } catch (err) {
    console.error(`[bot:${slug}] Error en generateStructuredReply:`, err);
    await botSend(db, sock, jid, phone, conversationId,
      `Hola, soy ${cfg?.ai_name ?? "Julieta"} de *${companyName}*. ¿En qué puedo ayudarte?`
    );
  }
}
