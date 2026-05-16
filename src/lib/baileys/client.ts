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
    syncFullHistory: false,
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

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[bot:${slug}][debug] messages.upsert — type:${type} cantidad:${messages.length}`);
    if (type !== "notify") return;
    for (const msg of messages) {
      await handleIncomingMessage(sock, msg, slug);
    }
  });
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
