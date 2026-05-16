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
import { getConnectionState, setConnectionState } from "../db";
import { handleIncomingMessage } from "./handler";

const AUTH_DIR = path.resolve(process.cwd(), "auth");

const logger = pino({ level: "silent" });

export interface BotHandle {
  sock: WASocket;
  shutdown: () => Promise<void>;
}

let handle: BotHandle | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function getHandle(): BotHandle | null {
  return handle;
}

export async function start(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version: [number, number, number] | undefined;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
    console.log(`[bot] Versión WhatsApp Web: ${version.join(".")}`);
  } catch (err) {
    console.warn("[bot] No se pudo obtener última versión de Baileys:", err);
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.macOS("Desktop"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  handle = {
    sock,
    shutdown: async () => {
      try {
        await sock.logout();
      } catch {}
      try {
        sock.end(undefined);
      } catch {}
    },
  };

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("[bot] QR recibido — escanea desde localhost:3000 o el terminal:");
      QRCodeTerminal.generate(qr, { small: true });
      setConnectionState({ status: "qr", qr_string: qr, phone: null });
    }

    if (connection === "connecting") {
      const current = getConnectionState();
      if (current.status === "disconnected") {
        setConnectionState({ status: "connecting" });
      }
    }

    if (connection === "open") {
      const rawId = sock.user?.id ?? "";
      const phone = rawId.split(":")[0];
      setConnectionState({ status: "connected", qr_string: null, phone });
      console.log(`[bot] Conectado como ${phone}`);
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
        ?.statusCode;

      console.log(`[bot] Conexión cerrada. Código: ${code}`);

      if (code === DisconnectReason.loggedOut) {
        console.log("[bot] Sesión cerrada (logout). Esperando nuevo QR.");
        setConnectionState({ status: "disconnected", qr_string: null, phone: null });
        return;
      }

      // Code 515 = pairing exitoso, reconectar normalmente
      // Code 440 = connectionReplaced, esperar más tiempo
      scheduleReconnect(code);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[bot][debug] messages.upsert — type:${type} cantidad:${messages.length}`);
    if (type !== "notify") return;
    for (const msg of messages) {
      await handleIncomingMessage(sock, msg);
    }
  });
}

function scheduleReconnect(code?: number) {
  if (reconnectTimer) return;
  const delay = code === 440 ? 15000 : 5000;
  console.log(`[bot] Reconectando en ${delay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (handle) {
      try {
        handle.sock.end(undefined);
      } catch {}
      handle = null;
    }
    start().catch((err) => console.error("[bot] Error al reconectar:", err));
  }, delay);
}
