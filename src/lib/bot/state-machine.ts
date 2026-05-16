/**
 * State machine del bot — diseño IA-first y genérico.
 *
 * Estados:
 *   INIT             → primer contacto, verifica consentimiento
 *   CONSENT_PENDING  → esperando SI/NO del cliente
 *   ACTIVE           → conversación libre guiada por ai_general_instructions + learnings
 *   COLLECTING_PEOPLE→ usuario eligió un producto, preguntando cantidad de personas
 *   QUOTE_SENT       → cotización enviada, esperando confirmación
 *   AWAITING_PAYMENT → esperando comprobante de pago (archivo)
 *   DONE             → reserva confirmada
 *
 * Los estados de recolección de datos (nombre, email, presupuesto, fecha)
 * fueron eliminados: Julieta los recoge orgánicamente en ACTIVE con su IA.
 */

import type { WASocket } from "@whiskeysockets/baileys";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getCompanyDb } from "../master/db-company";
import { generateStructuredReply, isUncertainResponse } from "../openrouter";
import { sendWithAntiBlock, sendMultipleWithAntiBlock, isOptOutMessage } from "./anti-block";

type BotState =
  | "INIT" | "CONSENT_PENDING" | "CONSENT_REJECTED"
  | "ACTIVE" | "COLLECTING_PEOPLE"
  | "QUOTE_SENT" | "AWAITING_PAYMENT" | "DONE";

const YES_KW = ["si","sí","acepto","ok","yes","claro","dale","de acuerdo","correcto","adelante","afirmativo","exacto"];
const NO_KW  = ["no","rechazo","no acepto","nope","negativo"];
function isYes(t: string) { return YES_KW.some(k => t.toLowerCase().trim().includes(k)); }
function isNo(t: string)  { return NO_KW.some(k  => t.toLowerCase().trim() === k); }

// ── DB helpers ────────────────────────────────────────────────────────────────

function saveMsg(db: Database.Database, convId: number, role: string, text: string) {
  try { db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(convId, role, text); } catch {}
}

function getBotState(db: Database.Database, convId: number) {
  return db.prepare("SELECT * FROM bot_conversation_state WHERE conversation_id=?")
    .get(convId) as { state: string; data: string; selected_product_id: number | null; opted_out: number } | null;
}

function setState(
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
  } catch (e) { console.error("[sm] setState error:", e); }
}

function getOrCreateDeal(db: Database.Database, convId: number): number {
  try {
    const existing = db.prepare("SELECT id FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(convId) as { id: number } | null;
    if (existing) return existing.id;
    const contact = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(convId) as { id: number } | null;
    const row = db.prepare(
      "INSERT INTO crm_deals (conversation_id, contact_id, stage) VALUES (?,?,?) RETURNING id"
    ).get(convId, contact?.id ?? null, "NUEVO") as { id: number } | null;
    return row?.id ?? 0;
  } catch (e) { console.error("[sm] getOrCreateDeal error:", e); return 0; }
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function send(db: Database.Database, sock: WASocket, jid: string, phone: string, convId: number, text: string) {
  saveMsg(db, convId, "assistant", text);
  await sendWithAntiBlock(sock, jid, text, phone);
}

async function sendMany(db: Database.Database, sock: WASocket, jid: string, phone: string, convId: number, texts: string[]) {
  for (const t of texts) saveMsg(db, convId, "assistant", t);
  await sendMultipleWithAntiBlock(sock, jid, texts, phone);
}

async function sendProductImages(
  db: Database.Database, sock: WASocket, jid: string,
  phone: string, convId: number, productId: number, caption: string
) {
  const images = db.prepare(
    "SELECT filename FROM product_images WHERE product_id=? ORDER BY order_index ASC"
  ).all(productId) as { filename: string }[];
  if (!images.length) return;
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
      if (i < images.length - 1) await new Promise(r => setTimeout(r, 700));
    } catch {}
  }
}

function detectProduct(text: string, products: { id: number; name: string; price_per_person: number; description: string | null }[]) {
  const lower = text.toLowerCase().trim();
  const num   = lower.match(/^\s*(\d+)\s*$/);
  if (num) {
    const idx = parseInt(num[1]) - 1;
    if (idx >= 0 && idx < products.length) return products[idx];
  }
  return products.find(p => lower.includes(p.name.toLowerCase().substring(0, 6))) ?? null;
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
  console.log(`[bot:${slug}] processBotMessage conv=${conversationId} text="${text.slice(0,60)}"`);

  const cfg = db.prepare("SELECT name, ai_name FROM company_config WHERE id=1").get() as {
    name: string | null; ai_name: string | null;
  } | null;
  const companyName = cfg?.name ?? "nuestra empresa";
  const aiName      = cfg?.ai_name ?? "Julieta";

  let bs = getBotState(db, conversationId);
  console.log(`[bot:${slug}] Estado: ${bs?.state ?? "null→INIT"} opted_out=${bs?.opted_out ?? 0}`);

  // ── Opt-out reactivación ─────────────────────────────────────────────
  if (bs?.opted_out) {
    db.prepare("UPDATE bot_conversation_state SET opted_out=0, state='ACTIVE', updated_at=unixepoch() WHERE conversation_id=?").run(conversationId);
    bs = getBotState(db, conversationId);
    await send(db, sock, jid, phone, conversationId, `¡Hola de nuevo! 👋 Bienvenido/a otra vez. ¿En qué puedo ayudarte?`);
    return;
  }

  // ── Opt-out explícito ────────────────────────────────────────────────
  if (isOptOutMessage(text)) {
    db.prepare(`
      INSERT INTO bot_conversation_state (conversation_id, opted_out, state) VALUES (?,1,'CONSENT_REJECTED')
      ON CONFLICT(conversation_id) DO UPDATE SET opted_out=1, state='CONSENT_REJECTED', updated_at=unixepoch()
    `).run(conversationId);
    const did = getOrCreateDeal(db, conversationId);
    if (did) db.prepare("UPDATE crm_deals SET stage='PERDIDO' WHERE id=?").run(did);
    await send(db, sock, jid, phone, conversationId,
      `Entendido. Eliminamos tus datos de nuestras comunicaciones. Si en el futuro deseas contactarnos, escríbenos. ¡Hasta pronto! 👋`
    );
    return;
  }

  const currentState = (bs?.state ?? "INIT") as BotState;
  const stateData: Record<string, unknown> = (() => {
    try { return bs?.data ? JSON.parse(bs.data) : {}; } catch { return {}; }
  })();

  // ── INIT ──────────────────────────────────────────────────────────────
  if (currentState === "INIT") {
    // Si hay mensajes previos (conversación existente), ir directo a ACTIVE
    const msgCount = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id=?").get(conversationId) as { c: number }).c;
    if (msgCount > 1) {
      // Conversación ya en curso — continuar sin reiniciar
      setState(db, conversationId, "ACTIVE");
      const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
      await send(db, sock, jid, phone, conversationId, reply);
      return;
    }

    // Primer mensaje — verificar política de tratamiento de datos
    const doc = db.prepare(
      "SELECT * FROM legal_documents WHERE type='data_treatment' AND active=1 ORDER BY id DESC LIMIT 1"
    ).get() as { id: number; title: string; content: string } | null;

    if (doc) {
      const summary = doc.content.slice(0, 320) + (doc.content.length > 320 ? "..." : "");
      await sendMany(db, sock, jid, phone, conversationId, [
        `¡Hola! Bienvenido/a a *${companyName}* 👋`,
        `Antes de continuar necesito tu autorización para tratar tus datos personales (Ley 1581 de 2012).\n\n📄 *${doc.title}*\n\n${summary}\n\nResponde *SI* para aceptar o *NO* para rechazar.`,
      ]);
      setState(db, conversationId, "CONSENT_PENDING");
      getOrCreateDeal(db, conversationId);
    } else {
      // Sin política → ir directo a ACTIVE
      setState(db, conversationId, "ACTIVE");
      getOrCreateDeal(db, conversationId);
      const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
      await send(db, sock, jid, phone, conversationId, reply);
    }
    return;
  }

  // ── CONSENT_PENDING ───────────────────────────────────────────────────
  if (currentState === "CONSENT_PENDING") {
    const doc = db.prepare("SELECT id FROM legal_documents WHERE type='data_treatment' AND active=1 ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
    if (isYes(text)) {
      if (doc) db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?,?,1)").run(conversationId, doc.id);
      setState(db, conversationId, "ACTIVE");
      const did = getOrCreateDeal(db, conversationId);
      if (did) db.prepare("UPDATE crm_deals SET stage='CALIFICADO' WHERE id=?").run(did);
      const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
      await send(db, sock, jid, phone, conversationId, reply);
    } else if (isNo(text)) {
      if (doc) db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?,?,0)").run(conversationId, doc.id);
      db.prepare(`INSERT INTO bot_conversation_state (conversation_id, opted_out, state) VALUES (?,1,'CONSENT_REJECTED')
        ON CONFLICT(conversation_id) DO UPDATE SET opted_out=1, state='CONSENT_REJECTED', updated_at=unixepoch()`).run(conversationId);
      await send(db, sock, jid, phone, conversationId,
        `Entendido. Sin tu autorización no podemos continuar. Si cambias de opinión, escríbenos. ¡Hasta pronto!`
      );
    } else {
      await send(db, sock, jid, phone, conversationId,
        `Por favor responde *SI* para aceptar o *NO* para rechazar la política de tratamiento de datos.`
      );
    }
    return;
  }

  // ── ACTIVE — conversación libre guiada por IA ─────────────────────────
  if (currentState === "ACTIVE") {
    const products = db.prepare(
      "SELECT id, name, price_per_person, description FROM products WHERE active=1"
    ).all() as { id: number; name: string; price_per_person: number; description: string | null }[];

    // ¿El usuario quiere comprar/seleccionar un producto?
    if (products.length > 0) {
      const selected = detectProduct(text, products);
      if (selected) {
        setState(db, conversationId, "COLLECTING_PEOPLE", stateData, selected.id);
        const did = getOrCreateDeal(db, conversationId);
        if (did) db.prepare("UPDATE crm_deals SET stage='PROPUESTA', product_id=? WHERE id=?").run(selected.id, did);
        const caption = `*${selected.name}*\n💰 $${selected.price_per_person.toLocaleString("es-CO")} por persona${selected.description ? `\n\n${selected.description}` : ""}`;
        await sendProductImages(db, sock, jid, phone, conversationId, selected.id, caption);
        await send(db, sock, jid, phone, conversationId,
          `¡Excelente elección con *${selected.name}*! ¿Para cuántas personas lo necesitas?`
        );
        return;
      }
    }

    // Respuesta libre de la IA
    const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName, products);
    await send(db, sock, jid, phone, conversationId, reply);
    return;
  }

  // ── COLLECTING_PEOPLE ─────────────────────────────────────────────────
  if (currentState === "COLLECTING_PEOPLE") {
    const numMatch = text.match(/\d+/);
    if (!numMatch) {
      await send(db, sock, jid, phone, conversationId, `¿Para cuántas personas? Indícame un número.`);
      return;
    }
    const people    = parseInt(numMatch[0]);
    const productId = getBotState(db, conversationId)?.selected_product_id;
    if (!productId) { setState(db, conversationId, "ACTIVE"); return; }

    const product = db.prepare("SELECT id, name, price_per_person FROM products WHERE id=?").get(productId) as { id: number; name: string; price_per_person: number } | null;
    if (!product) { setState(db, conversationId, "ACTIVE"); return; }
    const total = product.price_per_person * people;

    const did = getOrCreateDeal(db, conversationId);
    if (did) db.prepare("UPDATE crm_deals SET product_id=?, people_count=?, total_value=?, stage='PROPUESTA' WHERE id=?").run(productId, people, total, did);

    const banks = db.prepare("SELECT * FROM bank_accounts WHERE active=1").all() as { bank_name: string; account_type: string; account_number: string; account_holder: string | null }[];
    const bankInfo = banks.length > 0
      ? banks.map(b =>
          `🏦 *${b.bank_name}*\n  ${b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"}: ${b.account_number}${b.account_holder ? `\n  A nombre de: ${b.account_holder}` : ""}`
        ).join("\n\n")
      : "_Configura tus datos bancarios en Ajustes → Cuentas bancarias_";

    setState(db, conversationId, "QUOTE_SENT", { ...stateData, people_count: people, total }, productId);
    await sendMany(db, sock, jid, phone, conversationId, [
      `🎯 *Tu cotización*\n\n📦 *${product.name}*\n👥 ${people} persona${people !== 1 ? "s" : ""}\n💰 Total: *$${total.toLocaleString("es-CO")} COP*`,
      `Para confirmar tu reserva, realiza el pago a:\n\n${bankInfo}\n\n✅ Cuando hayas pagado, envíanos el comprobante por este chat y confirmamos tu reserva.`,
    ]);
    return;
  }

  // ── QUOTE_SENT ────────────────────────────────────────────────────────
  if (currentState === "QUOTE_SENT") {
    const bsCurrent = getBotState(db, conversationId);
    setState(db, conversationId, "AWAITING_PAYMENT", stateData, bsCurrent?.selected_product_id ?? null);
    const did = getOrCreateDeal(db, conversationId);
    if (did) db.prepare("UPDATE crm_deals SET stage='NEGOCIACION' WHERE id=?").run(did);
    await send(db, sock, jid, phone, conversationId,
      `¡Gracias! Un asesor verificará tu pago y te confirmará la reserva pronto. 🙏\n\nMientras tanto, ¿tienes alguna pregunta?`
    );
    return;
  }

  // ── AWAITING_PAYMENT ──────────────────────────────────────────────────
  if (currentState === "AWAITING_PAYMENT") {
    await send(db, sock, jid, phone, conversationId,
      `Estamos verificando tu pago y te confirmaremos la reserva muy pronto. ¿Tienes alguna otra pregunta? 😊`
    );
    return;
  }

  // ── DONE / fallback — siempre la IA responde ──────────────────────────
  console.log(`[bot:${slug}] Estado ${currentState} → IA libre`);
  const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
  await send(db, sock, jid, phone, conversationId, reply);
}

// ── Función centralizada de respuesta IA ─────────────────────────────────────
async function aiReply(
  db: Database.Database,
  sock: WASocket,
  jid: string,
  phone: string,
  convId: number,
  text: string,
  history: { role: string; content: string }[],
  slug: string,
  companyName: string,
  aiName: string,
  products?: { id: number; name: string; price_per_person: number; description: string | null }[]
): Promise<string> {
  // Actualizar CRM con señal de interés
  try {
    const did = getOrCreateDeal(db, convId);
    if (did) {
      const current = db.prepare("SELECT stage FROM crm_deals WHERE id=?").get(did) as { stage: string } | null;
      if (current?.stage === "NUEVO") db.prepare("UPDATE crm_deals SET stage='CALIFICADO' WHERE id=?").run(did);
    }
  } catch {}

  const productList = products ?? db.prepare(
    "SELECT id, name, price_per_person, description FROM products WHERE active=1"
  ).all() as { id: number; name: string; price_per_person: number; description: string | null }[];

  try {
    const reply = await generateStructuredReply(
      history, "ACTIVE",
      { products: productList, companyName, collectedData: { text } },
      slug
    );
    if (isUncertainResponse(reply)) {
      try { db.prepare("INSERT INTO julieta_alerts (conversation_id, question, julieta_response) VALUES (?,?,?)").run(convId, text, reply); } catch {}
    }
    return reply;
  } catch (err) {
    console.error(`[bot:${slug}] aiReply error:`, err);
    return `Hola, soy ${aiName} de *${companyName}*. ¿En qué puedo ayudarte hoy? 😊`;
  }
}

