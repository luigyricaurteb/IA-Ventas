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
import { autoLearn } from "./auto-learn";

type BotState =
  | "INIT" | "CONSENT_PENDING" | "CONSENT_REJECTED"
  | "COLLECTING_CONTACT"
  | "ACTIVE" | "COLLECTING_PEOPLE"
  | "QUOTE_SENT" | "AWAITING_PAYMENT" | "CONFIRMING_PAYMENT" | "DONE";

const YES_KW    = ["si","sí","acepto","ok","yes","claro","dale","de acuerdo","correcto","adelante","afirmativo","exacto","confirmado","así es","eso es"];
const NO_KW     = ["no","rechazo","no acepto","nope","negativo","para nada","en absoluto"];
const CANCEL_KW = [
  "ya no quiero","no lo quiero","no quiero","cancela","cancelar","cancelado",
  "ya no me interesa","no me interesa","ya no aplica","no voy a comprar",
  "no lo voy a tomar","me arrepentí","me arrepenti","cambié de opinión","cambie de opinion",
  "ya no voy","ya no vamos","olvídalo","olvidalo","dejalo","déjalo",
  "no voy a pagar","ya no necesito","gracias pero no","no gracias",
  "lo pensé mejor","lo pense mejor","no me sirve","no me conviene",
  "lo dejo","no lo tomaré","no lo tomare",
];

function isYes(t: string) { return YES_KW.some(k => t.toLowerCase().trim().includes(k)); }
function isNo(t: string)  { return NO_KW.some(k => t.toLowerCase().trim() === k || t.toLowerCase().trim().startsWith(k + " ")); }
function isCancellation(t: string) { const l = t.toLowerCase().trim(); return CANCEL_KW.some(k => l.includes(k)); }

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
  slug = "platform",
  pushName?: string
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

  // ── Detección global de cancelación ──────────────────────────────────
  // Si el cliente quiere cancelar en cualquier estado de flujo comercial,
  // reset a ACTIVE y dejamos que la IA responda con empatía
  const FLOW_STATES: BotState[] = ["COLLECTING_PEOPLE","QUOTE_SENT","AWAITING_PAYMENT","CONFIRMING_PAYMENT"];
  if (FLOW_STATES.includes(currentState) && isCancellation(text)) {
    setState(db, conversationId, "ACTIVE");
    const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
    await send(db, sock, jid, phone, conversationId, reply);
    autoLearn(db, conversationId).catch(() => {});
    return;
  }

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

    getOrCreateDeal(db, conversationId);

    if (doc) {
      // Con política → mostrar primero, luego recolectar datos
      const summary = doc.content.slice(0, 320) + (doc.content.length > 320 ? "..." : "");
      await sendMany(db, sock, jid, phone, conversationId, [
        `¡Hola! Bienvenido/a a *${companyName}* 👋`,
        `Antes de continuar necesito tu autorización para tratar tus datos personales (Ley 1581 de 2012).\n\n📄 *${doc.title}*\n\n${summary}\n\nResponde *SI* para aceptar o *NO* para rechazar.`,
      ]);
      setState(db, conversationId, "CONSENT_PENDING");
    } else {
      // Sin política → saludar y pedir nombre directamente
      await send(db, sock, jid, phone, conversationId,
        `¡Hola! Bienvenido/a a *${companyName}* 👋\n\nPara poder ayudarte mejor, ¿me podrías compartir tu nombre completo?`
      );
      setState(db, conversationId, "COLLECTING_CONTACT", { step: "name" });
    }
    return;
  }

  // ── CONSENT_PENDING ───────────────────────────────────────────────────
  if (currentState === "CONSENT_PENDING") {
    const doc = db.prepare("SELECT id FROM legal_documents WHERE type='data_treatment' AND active=1 ORDER BY id DESC LIMIT 1").get() as { id: number } | null;
    if (isYes(text)) {
      if (doc) db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?,?,1)").run(conversationId, doc.id);
      const did = getOrCreateDeal(db, conversationId);
      if (did) db.prepare("UPDATE crm_deals SET stage='CALIFICADO' WHERE id=?").run(did);

      // SIEMPRE pedir nombre y email — condición general del sistema
      const existingContact = db.prepare("SELECT full_name, email FROM contacts WHERE conversation_id=? LIMIT 1")
        .get(conversationId) as { full_name: string | null; email: string | null } | null;

      const savedName = existingContact?.full_name ?? pushName ?? null;
      const savedEmail = existingContact?.email ?? null;

      if (!savedName) {
        // No tenemos nombre — pedirlo
        setState(db, conversationId, "COLLECTING_CONTACT", { step: "name" });
        await send(db, sock, jid, phone, conversationId,
          `¡Gracias por aceptar! 😊 Para brindarte una mejor atención, ¿me podrías compartir tu nombre completo?`
        );
      } else if (!savedEmail) {
        // Tenemos nombre pero no email
        if (savedName && !existingContact?.full_name) {
          // Guardar pushName como nombre si no está en contactos
          const ec = db.prepare("SELECT id FROM contacts WHERE conversation_id=? LIMIT 1").get(conversationId) as { id: number } | null;
          if (ec) db.prepare("UPDATE contacts SET full_name=? WHERE id=?").run(savedName, ec.id);
          else db.prepare("INSERT INTO contacts (conversation_id, full_name) VALUES (?,?)").run(conversationId, savedName);
        }
        setState(db, conversationId, "COLLECTING_CONTACT", { step: "email", name: savedName });
        await send(db, sock, jid, phone, conversationId,
          `¡Gracias, ${savedName}! 😊 ¿Me compartes tu correo electrónico para enviarte información y confirmaciones? 📧`
        );
      } else {
        // Ya tenemos nombre y email — ir a ACTIVE
        setState(db, conversationId, "ACTIVE");
        await send(db, sock, jid, phone, conversationId,
          `¡Perfecto! Ya tengo tu información. ¿En qué puedo ayudarte hoy? 😊`
        );
      }
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

  // ── COLLECTING_CONTACT — recopila nombre y email del cliente ──────────
  if (currentState === "COLLECTING_CONTACT") {
    const step = (stateData.step as string) ?? "name";

    if (step === "name") {
      const name = text.trim();
      if (name.length < 2 || /^\d+$/.test(name)) {
        await send(db, sock, jid, phone, conversationId, `Por favor dime tu nombre completo para continuar.`);
        return;
      }
      // Guardar nombre en conversación y contacto
      db.prepare("UPDATE conversations SET name=? WHERE id=?").run(name, conversationId);
      const existing = db.prepare("SELECT id FROM contacts WHERE conversation_id=? LIMIT 1").get(conversationId) as { id: number } | null;
      let contactId: number;
      if (existing) {
        db.prepare("UPDATE contacts SET full_name=? WHERE id=?").run(name, existing.id);
        contactId = existing.id;
      } else {
        const ins = db.prepare("INSERT INTO contacts (conversation_id, full_name) VALUES (?,?) RETURNING id").get(conversationId, name) as { id: number };
        contactId = ins.id;
      }
      // Actualizar el deal con el contact_id para que el CRM muestre el nombre
      db.prepare("UPDATE crm_deals SET contact_id=? WHERE conversation_id=? AND (contact_id IS NULL OR contact_id=0)").run(contactId, conversationId);

      // Pasar a recopilar email
      setState(db, conversationId, "COLLECTING_CONTACT", { step: "email", name });
      await send(db, sock, jid, phone, conversationId,
        `¡Perfecto, ${name}! 😊 ¿Me compartes tu correo electrónico? Lo usaremos para enviarte información y confirmaciones. 📧`
      );
    } else if (step === "email") {
      const name = (stateData.name as string) ?? pushName ?? "cliente";
      const emailInput = text.trim().toLowerCase();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput);
      const skipped = ["no", "no tengo", "omitir", "saltar", "skip", "ninguno", "n/a"].some(k => emailInput.includes(k));

      if (isEmail) {
        const existingC = db.prepare("SELECT id FROM contacts WHERE conversation_id=? LIMIT 1").get(conversationId) as { id: number } | null;
        if (existingC) {
          db.prepare("UPDATE contacts SET email=? WHERE id=?").run(emailInput, existingC.id);
        } else {
          db.prepare("INSERT INTO contacts (conversation_id, full_name, email) VALUES (?,?,?)").run(conversationId, name, emailInput);
        }
      }

      // Ir a ACTIVE — con o sin email
      setState(db, conversationId, "ACTIVE");

      if (!isEmail && !skipped) {
        // Respuesta inválida — dejar pasar igual (no bloquear)
        await send(db, sock, jid, phone, conversationId,
          `No reconocí ese correo, pero no hay problema — lo puedes compartir después si lo deseas. ¿En qué te puedo ayudar hoy? 😊`
        );
      } else {
        const thanks = isEmail ? `Gracias, ${name}! Ya tengo tus datos. ` : `Entendido, ${name}. `;
        const reply = await aiReply(db, sock, jid, phone, conversationId,
          `${thanks}¿En qué te puedo ayudar hoy?`,
          history, slug, companyName, aiName);
        await send(db, sock, jid, phone, conversationId, reply);
      }

      autoLearn(db, conversationId).catch(() => {});
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
    autoLearn(db, conversationId).catch(() => {});
    return;
  }

  // ── COLLECTING_PEOPLE ─────────────────────────────────────────────────
  if (currentState === "COLLECTING_PEOPLE") {
    const numMatch = text.match(/\d+/);
    if (!numMatch) {
      // Respuesta no numérica — dejar que la IA maneje (puede ser pregunta, aclaración, etc.)
      const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
      await send(db, sock, jid, phone, conversationId, reply);
      autoLearn(db, conversationId).catch(() => {});
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

  // ── CONFIRMING_PAYMENT — cliente debe confirmar el monto leído ───────
  if (currentState === "CONFIRMING_PAYMENT") {
    const proofId = (stateData.proof_id as number) ?? null;
    const aiMonto = (stateData.ai_monto as number) ?? 0;

    // Obtener total SIEMPRE desde el DB (no de stateData que puede ser 0)
    const dealDB = db.prepare("SELECT id, total_value, paid_amount FROM crm_deals WHERE conversation_id=? ORDER BY id DESC LIMIT 1")
      .get(conversationId) as { id: number; total_value: number | null; paid_amount: number | null } | null;
    const total     = dealDB?.total_value ?? (stateData.total as number) ?? 0;
    const paidBefore = dealDB?.paid_amount ?? 0;

    function fmt(n: number) { return `$${n.toLocaleString("es-CO")} COP`; }

    if (isYes(text)) {
      setState(db, conversationId, "AWAITING_PAYMENT");

      const totalPaid = paidBefore + aiMonto;
      const saldo     = total > 0 ? Math.max(0, total - totalPaid) : 0;
      const minAbono  = total * 0.5;

      // Actualizar paid_amount en el deal
      if (dealDB?.id && aiMonto > 0) {
        db.prepare("UPDATE crm_deals SET paid_amount=?, stage='NEGOCIACION' WHERE id=?").run(totalPaid, dealDB.id);
      }

      let respuesta: string;

      if (total > 0 && aiMonto > 0 && aiMonto < minAbono && totalPaid < minAbono) {
        // Monto insuficiente — menos del 50%
        respuesta =
          `⚠️ Gracias por confirmar el pago de *${fmt(aiMonto)}*.\n\n` +
          `Sin embargo, el mínimo para reservar es el *50%* del total:\n` +
          `• Total del servicio: *${fmt(total)}*\n` +
          `• Mínimo requerido (50%): *${fmt(minAbono)}*\n\n` +
          `Por favor realiza una nueva transferencia por el monto mínimo y envíanos el comprobante. 🙏`;
        if (proofId) db.prepare("UPDATE payment_proofs SET reviewed=-1 WHERE id=?").run(proofId);

      } else if (saldo > 0) {
        // Pago parcial válido (≥ 50%) — hay saldo pendiente
        respuesta =
          `✅ *¡Abono confirmado!*\n\n` +
          `💵 Abono recibido: *${fmt(aiMonto)}*\n` +
          (total > 0 ? `📊 Total del servicio: *${fmt(total)}*\n` : "") +
          `📊 Total pagado hasta ahora: *${fmt(totalPaid)}*\n` +
          `⚠️ *Saldo pendiente: ${fmt(saldo)}*\n\n` +
          `Un asesor verificará tu pago. Para completar la reserva, deberás cancelar el saldo pendiente. Puedes enviarlo cuando quieras con otro comprobante. 🙏`;

      } else {
        // Pago completo
        respuesta =
          `✅ *¡Pago confirmado!*\n\n` +
          `💵 Valor recibido: *${fmt(aiMonto)}*\n` +
          (total > 0 ? `📊 Total del servicio: *${fmt(total)}*\n` : "") +
          `\nUn asesor verificará tu comprobante y confirmará tu reserva pronto. ¡Gracias por confiar en nosotros! 🙏`;
      }

      await send(db, sock, jid, phone, conversationId, respuesta);

    } else if (isNo(text)) {
      if (proofId) db.prepare("UPDATE payment_proofs SET reviewed=-1 WHERE id=?").run(proofId);
      setState(db, conversationId, "ACTIVE");
      await send(db, sock, jid, phone, conversationId,
        `Entendido. Por favor envíanos el comprobante correcto, o escríbenos el monto exacto que transferiste. 📎`
      );

    } else {
      // ¿Escribió un monto directamente?
      const numMatch = text.replace(/[$.:\s]/g, "").replace(/[.,]/g, "").match(/\d{4,}/);
      if (numMatch && Number(numMatch[0]) > 0) {
        const manualMonto = Number(numMatch[0]);
        if (proofId) db.prepare("UPDATE payment_proofs SET ai_amount=? WHERE id=?").run(manualMonto, proofId);
        const newData = { ...stateData, ai_monto: manualMonto };
        setState(db, conversationId, "CONFIRMING_PAYMENT", newData);
        await send(db, sock, jid, phone, conversationId,
          `Anotado. ¿Confirmamos un pago de *$${manualMonto.toLocaleString("es-CO")} COP*? Responde *SI* para confirmar o *NO* para corregir.`
        );
      } else {
        // Respuesta ambigua — la IA la maneja con contexto completo
        setState(db, conversationId, "ACTIVE");
        const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
        await send(db, sock, jid, phone, conversationId, reply);
        autoLearn(db, conversationId).catch(() => {});
      }
    }
    return;
  }

  // ── DONE / fallback — siempre la IA responde ──────────────────────────
  console.log(`[bot:${slug}] Estado ${currentState} → IA libre`);
  const reply = await aiReply(db, sock, jid, phone, conversationId, text, history, slug, companyName, aiName);
  await send(db, sock, jid, phone, conversationId, reply);
  autoLearn(db, conversationId).catch(() => {});
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

