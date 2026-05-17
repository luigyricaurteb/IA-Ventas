import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from "@whiskeysockets/baileys";
import type { WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import QRCodeTerminal from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs";
import { getCompanyDb } from "../master/db-company";
import { handleIncomingMessage } from "./handler";

const AUTH_BASE = process.env.AUTH_DIR || path.resolve(process.cwd(), "auth");
const logger = pino({ level: "silent" });

export interface BotHandle {
  slug: string;
  sock: WASocket;
  shutdown: () => Promise<void>;
}

// Pool of active company bots: slug → handle
const handles = new Map<string, BotHandle>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getHandle(slug = "platform"): BotHandle | null {
  return handles.get(slug) ?? null;
}

export function getAllHandles(): Map<string, BotHandle> {
  return handles;
}

export async function startCompany(slug: string): Promise<void> {
  if (handles.has(slug)) return; // ya corriendo

  const db = getCompanyDb(slug);
  const authDir = path.join(AUTH_BASE, `company_${slug}`);

  // Migración automática: si existen credenciales en el directorio raíz (sesión previa),
  // muévelas al directorio de empresa para no perder la sesión activa
  if (!fs.existsSync(authDir) && fs.existsSync(AUTH_BASE)) {
    const legacyCreds = path.join(AUTH_BASE, "creds.json");
    if (fs.existsSync(legacyCreds)) {
      console.log(`[bot:${slug}] Migrando sesión previa de Baileys a ${authDir}`);
      try {
        fs.mkdirSync(authDir, { recursive: true });
        for (const file of fs.readdirSync(AUTH_BASE)) {
          if (file.startsWith(".") || fs.statSync(path.join(AUTH_BASE, file)).isDirectory()) continue;
          fs.renameSync(path.join(AUTH_BASE, file), path.join(authDir, file));
        }
        console.log(`[bot:${slug}] Sesión migrada correctamente`);
      } catch (e) {
        console.warn(`[bot:${slug}] Error migrando sesión:`, e);
      }
    }
  }

  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
  } catch {}

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    // syncFullHistory: true hace que WhatsApp tarde más en emitir el QR porque
    // prepara el historial completo antes de la autenticación.
    // Lo dejamos en false para que el QR aparezca rápido (<30s).
    // El historial llega igual vía messaging-history.set después de conectar.
    syncFullHistory: false,
    getMessage: async () => ({ conversation: "" }),
  });

  const handle: BotHandle = {
    slug,
    sock,
    shutdown: async () => {
      handles.delete(slug);
      try { await sock.logout(); } catch {}
      try { sock.end(undefined); } catch {}
    },
  };
  handles.set(slug, handle);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const current = db.prepare("SELECT qr_string FROM connection_state WHERE id=1").get() as { qr_string: string | null } | null;
      if (current?.qr_string !== qr) {
        console.log(`[bot:${slug}] QR recibido — escanea desde el dashboard:`);
        QRCodeTerminal.generate(qr, { small: true });
        db.prepare("UPDATE connection_state SET status='qr', qr_string=?, phone=NULL, updated_at=unixepoch() WHERE id=1").run(qr);
      }
    }

    if (connection === "connecting") {
      const s = db.prepare("SELECT status FROM connection_state WHERE id=1").get() as { status: string } | null;
      if (s?.status === "disconnected") {
        db.prepare("UPDATE connection_state SET status='connecting', updated_at=unixepoch() WHERE id=1").run();
      }
    }

    if (connection === "open") {
      const rawId = sock.user?.id ?? "";
      const phone = rawId.split(":")[0];
      db.prepare("UPDATE connection_state SET status='connected', qr_string=NULL, phone=?, updated_at=unixepoch() WHERE id=1").run(phone);
      console.log(`[bot:${slug}] Conectado como ${phone}`);

      // Corregir conversaciones LID sin historial (eliminarlas si están vacías)
      try {
        const lidRows = db.prepare(
          "SELECT c.id FROM conversations c WHERE LENGTH(c.phone) >= 14 AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id=c.id)"
        ).all() as { id: number }[];
        let cleaned = 0;
        for (const row of lidRows) {
          db.prepare("DELETE FROM bot_conversation_state WHERE conversation_id=?").run(row.id);
          db.prepare("DELETE FROM contacts WHERE conversation_id=?").run(row.id);
          db.prepare("DELETE FROM crm_deals WHERE conversation_id=?").run(row.id);
          db.prepare("DELETE FROM conversations WHERE id=?").run(row.id);
          cleaned++;
        }
        if (cleaned > 0) console.log(`[bot:${slug}] 🧹 ${cleaned} conversaciones LID vacías eliminadas (historial preservado)`);
      } catch (e) {
        console.warn(`[bot:${slug}] Error limpiando LIDs:`, e);
      }
    }

    if (connection === "close") {
      handles.delete(slug);
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      console.log(`[bot:${slug}] Conexión cerrada. Código: ${code}`);

      if (code === DisconnectReason.loggedOut) {
        db.prepare("UPDATE connection_state SET status='disconnected', qr_string=NULL, phone=NULL, updated_at=unixepoch() WHERE id=1").run();
        console.log(`[bot:${slug}] Sesión cerrada (logout). Esperando nuevo QR.`);
        return;
      }
      scheduleReconnect(slug, code);
    }
  });

  // ── Historial al conectar (conversaciones previas) ──────────────────────
  sock.ev.on("messaging-history.set", ({ messages, chats, contacts, isLatest }) => {
    console.log(`[bot:${slug}] messaging-history.set — ${chats.length} chats, ${messages.length} msgs, isLatest=${isLatest}`);
    try {
      importHistory(db, slug, chats, contacts, messages);
    } catch (e) {
      console.error(`[bot:${slug}] Error importando historial:`, e);
    }
  });

  // ── Mensajes en tiempo real ─────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type === "append") {
      // Mensajes históricos adicionales — guardar en DB sin responder
      importHistoricalMessages(db, messages);
      return;
    }
    if (type !== "notify") return;
    for (const msg of messages) {
      await handleIncomingMessage(sock, msg, slug);
    }
  });
}

type LongLike = { low: number; high: number; unsigned: boolean };
function toLong(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "object" && "low" in (v as object)) return (v as LongLike).low;
  return null;
}

// ── Importar historial de conversaciones desde Baileys ───────────────────────
// Extrae el contenido de cualquier tipo de mensaje de WhatsApp
function extractMsgContent(msg: import("@whiskeysockets/baileys").proto.IWebMessageInfo): string | null {
  const m = msg.message;
  if (!m) return null;

  // Texto plano
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;

  // Multimedia con caption
  const caption =
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.documentWithCaptionMessage?.message?.documentMessage?.caption || null;

  // Descripción por tipo
  if (m.imageMessage) return caption ? `📷 ${caption}` : "📷 [Imagen]";
  if (m.videoMessage) return caption ? `🎬 ${caption}` : "🎬 [Video]";
  if (m.audioMessage) return m.audioMessage.ptt ? "🎤 [Nota de voz]" : "🎵 [Audio]";
  if (m.documentMessage) return caption ? `📎 ${caption}` : `📎 [${m.documentMessage.fileName ?? "Documento"}]`;
  if (m.stickerMessage) return "🎭 [Sticker]";
  if (m.contactMessage) return `👤 [Contacto: ${m.contactMessage.displayName ?? ""}]`;
  if (m.locationMessage) return "📍 [Ubicación]";
  if (m.liveLocationMessage) return "📍 [Ubicación en vivo]";
  if (m.reactionMessage) return null; // Reacciones no las guardamos
  if (m.viewOnceMessage?.message) return "👁 [Mensaje de una vez]";
  if ((m as Record<string, unknown>).productMessage) return "🛍️ [Producto de catálogo]";
  if ((m as Record<string, unknown>).orderMessage) return "🛒 [Pedido]";

  return null;
}

function importHistory(
  db: import("better-sqlite3").Database,
  slug: string,
  chats: { id: string; name?: string | null; conversationTimestamp?: unknown }[],
  contacts: { id: string; name?: string | null; notify?: string | null; lid?: string | null; jid?: string | null }[],
  messages: import("@whiskeysockets/baileys").proto.IWebMessageInfo[]
) {
  // ── Construir mapa LID → teléfono real ─────────────────────────────────
  // Contact.jid = teléfono real (@s.whatsapp.net)
  // Contact.lid = identificador interno (@lid)
  // Contact.id  = cualquiera de los dos (el que WhatsApp usa en este sync)
  const lidToPhone = new Map<string, string>(); // "261224222691346" → "57300123456"
  const contactNames = new Map<string, string>(); // JID → nombre

  for (const c of contacts) {
    const name = c.name || c.notify || null;
    // Caso 1: id es @s.whatsapp.net y tiene lid → mapeamos lid → phone
    if (c.id.endsWith("@s.whatsapp.net") && c.lid) {
      const phone = c.id.split("@")[0];
      const lid   = c.lid.split("@")[0];
      lidToPhone.set(lid, phone);
      if (name) contactNames.set(phone, name);
    }
    // Caso 2: id es @lid y tiene jid → mapeamos lid → phone
    if (c.id.endsWith("@lid") && c.jid) {
      const lid   = c.id.split("@")[0];
      const phone = c.jid.split("@")[0];
      lidToPhone.set(lid, phone);
      if (name) contactNames.set(phone, name);
    }
    // Caso 3: id es @s.whatsapp.net sin lid → solo guardar nombre
    if (c.id.endsWith("@s.whatsapp.net")) {
      const phone = c.id.split("@")[0];
      if (name) contactNames.set(phone, name);
    }
  }

  // Resolver teléfono real desde un JID (puede ser @s.whatsapp.net o @lid)
  function resolvePhone(jid: string): string | null {
    if (jid.endsWith("@s.whatsapp.net")) return jid.split("@")[0];
    if (jid.endsWith("@lid")) {
      const lid = jid.split("@")[0];
      return lidToPhone.get(lid) ?? null; // null si no tenemos el mapeo
    }
    return null;
  }

  // ── Actualizar conversaciones LID existentes con el teléfono real ───────
  // Esto corrige conversaciones que ya estaban en la DB con número LID
  let fixed = 0;
  for (const [lid, phone] of lidToPhone) {
    try {
      const rows = db.prepare("SELECT id FROM conversations WHERE phone=?").all(lid) as { id: number }[];
      for (const row of rows) {
        // Verificar que no existe ya una conversación con el teléfono real
        const existing = db.prepare("SELECT id FROM conversations WHERE phone=?").get(phone) as { id: number } | null;
        if (existing && existing.id !== row.id) {
          // Mover mensajes y datos al conversation real, luego borrar el LID
          db.prepare("UPDATE messages SET conversation_id=? WHERE conversation_id=?").run(existing.id, row.id);
          db.prepare("UPDATE bot_conversation_state SET conversation_id=? WHERE conversation_id=?").run(existing.id, row.id);
          db.prepare("UPDATE contacts SET conversation_id=? WHERE conversation_id=?").run(existing.id, row.id);
          db.prepare("UPDATE crm_deals SET conversation_id=? WHERE conversation_id=?").run(existing.id, row.id);
          db.prepare("UPDATE payment_proofs SET conversation_id=? WHERE conversation_id=?").run(existing.id, row.id);
          db.prepare("UPDATE outbox SET conversation_id=? WHERE conversation_id=?").run(existing.id, row.id);
          db.prepare("DELETE FROM conversations WHERE id=?").run(row.id);
        } else {
          // Solo actualizar el teléfono en la conversación LID
          const name = contactNames.get(phone);
          db.prepare("UPDATE conversations SET phone=?, name=COALESCE(?,name) WHERE id=?").run(phone, name ?? null, row.id);
        }
        fixed++;
      }
    } catch {}
  }
  if (fixed > 0) console.log(`[bot:${slug}] 🔧 ${fixed} conversaciones LID corregidas con número real`);

  // 1. Crear/actualizar conversaciones — ahora aceptamos TAMBIÉN @lid si podemos resolverlos
  let convsCreated = 0;
  for (const chat of chats) {
    const phone = resolvePhone(chat.id);
    if (!phone) continue; // LID sin mapeo → omitir

    const name = chat.name || contactNames.get(phone) || null;
    const ts   = toLong(chat.conversationTimestamp);
    try {
      db.prepare(`
        INSERT INTO conversations (phone, name, last_message_at)
        VALUES (?,?,?)
        ON CONFLICT(phone) DO UPDATE SET
          name = COALESCE(excluded.name, name),
          last_message_at = CASE
            WHEN excluded.last_message_at > COALESCE(last_message_at, 0)
            THEN excluded.last_message_at
            ELSE last_message_at
          END
      `).run(phone, name, ts);
      convsCreated++;
    } catch {}
  }

  // 2. Insertar mensajes del historial (TODOS los tipos, no solo texto)
  let msgsImported = 0;
  const convLatestTs = new Map<number, number>();

  for (const msg of messages) {
    try {
      const jid = msg.key.remoteJid ?? "";
      // Resolver tanto @s.whatsapp.net como @lid
      const phone = resolvePhone(jid);
      if (!phone) continue;

      const conv = db.prepare("SELECT id FROM conversations WHERE phone=?").get(phone) as { id: number } | null;
      if (!conv) continue;

      const text = extractMsgContent(msg);
      if (!text) continue;

      const role = msg.key.fromMe ? "assistant" : "user";
      const ts = toLong(msg.messageTimestamp) ?? Math.floor(Date.now() / 1000);

      // Deduplicar
      const exists = db.prepare(
        "SELECT id FROM messages WHERE conversation_id=? AND role=? AND created_at=? LIMIT 1"
      ).get(conv.id, role, ts);
      if (exists) continue;

      db.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?,?,?,?)")
        .run(conv.id, role, text, ts);
      msgsImported++;

      // Rastrear el timestamp más reciente por conversación
      const current = convLatestTs.get(conv.id) ?? 0;
      if (ts > current) convLatestTs.set(conv.id, ts);
    } catch {}
  }

  // 3. Actualizar last_message_at con el timestamp real del mensaje más reciente
  for (const [convId, ts] of convLatestTs) {
    try {
      db.prepare(`
        UPDATE conversations SET last_message_at = ?
        WHERE id = ? AND (last_message_at IS NULL OR last_message_at < ?)
      `).run(ts, convId, ts);
    } catch {}
  }

  console.log(`[bot:${slug}] ✅ Historial: ${convsCreated} conversaciones, ${msgsImported} mensajes importados`);
}

function importHistoricalMessages(
  db: import("better-sqlite3").Database,
  messages: import("@whiskeysockets/baileys").proto.IWebMessageInfo[]
) {
  for (const msg of messages) {
    try {
      const jid = msg.key.remoteJid ?? "";
      // Solo @s.whatsapp.net en tiempo real (LIDs se resuelven en importHistory)
      if (!jid.endsWith("@s.whatsapp.net")) continue;
      const phone = jid.split("@")[0];
      const conv = db.prepare("SELECT id FROM conversations WHERE phone=?").get(phone) as { id: number } | null;
      if (!conv) continue;

      const text = extractMsgContent(msg);
      if (!text) continue;

      const role = msg.key.fromMe ? "assistant" : "user";
      const ts = toLong(msg.messageTimestamp) ?? Math.floor(Date.now() / 1000);

      const exists = db.prepare(
        "SELECT id FROM messages WHERE conversation_id=? AND role=? AND created_at=? LIMIT 1"
      ).get(conv.id, role, ts);

      if (!exists) {
        db.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?,?,?,?)")
          .run(conv.id, role, text, ts);
        // Actualizar last_message_at para que el chat suba en la lista
        db.prepare(
          "UPDATE conversations SET last_message_at=? WHERE id=? AND (last_message_at IS NULL OR last_message_at < ?)"
        ).run(ts, conv.id, ts);
      }
    } catch {}
  }
}


function scheduleReconnect(slug: string, code?: number) {
  if (reconnectTimers.has(slug)) return;
  const delay = code === 440 ? 30000 : code === 408 ? 20000 : 10000;
  console.log(`[bot:${slug}] Reconectando en ${delay / 1000}s (código ${code})...`);
  const timer = setTimeout(() => {
    reconnectTimers.delete(slug);
    startCompany(slug).catch(err => console.error(`[bot:${slug}] Error al reconectar:`, err));
  }, delay);
  reconnectTimers.set(slug, timer);
}

// Compatibilidad: arrancar empresa "platform" (empresa del master)
export async function start(): Promise<void> {
  await startCompany("platform");
}
