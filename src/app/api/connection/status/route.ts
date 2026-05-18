export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const HEARTBEAT_PATH = path.join(DATA_DIR, ".bot_alive");

function triggerRestart() {
  const flagPaths = [
    path.join(DATA_DIR, ".restart"),
    path.resolve(process.cwd(), "data", ".restart"),
    path.resolve(process.cwd(), ".restart"),
  ];
  for (const p of flagPaths) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, new Date().toISOString());
    } catch {}
  }
}

function botIsAlive(): boolean {
  try {
    const ts = parseInt(fs.readFileSync(HEARTBEAT_PATH, "utf8"), 10);
    return (Math.floor(Date.now() / 1000) - ts) < 60;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // ── Meta Cloud API: si tiene credenciales guardadas → siempre "connected" ──
  // Con Meta no hay WebSocket — la conexión es por HTTP/webhook, siempre activa
  const waConfig = db.prepare(
    "SELECT provider, wa_access_token, wa_phone_number_id, wa_phone_display FROM whatsapp_config WHERE id=1"
  ).get() as {
    provider: string;
    wa_access_token: string | null;
    wa_phone_number_id: string | null;
    wa_phone_display: string | null;
  } | null;

  if (waConfig?.provider === "meta" && waConfig.wa_access_token && waConfig.wa_phone_number_id) {
    // Actualizar connection_state para que el dashboard muestre el estado correcto
    db.prepare(
      "UPDATE connection_state SET status='connected', phone=?, qr_string=NULL, updated_at=unixepoch() WHERE id=1"
    ).run(waConfig.wa_phone_display ?? waConfig.wa_phone_number_id);

    return NextResponse.json({
      status: "connected",
      phone: waConfig.wa_phone_display ?? waConfig.wa_phone_number_id,
      provider: "meta",
    });
  }

  // ── Baileys (WebSocket): leer estado de la DB ──────────────────────────────
  const state = db.prepare("SELECT * FROM connection_state WHERE id = 1").get() as {
    status: "disconnected" | "qr" | "connecting" | "connected";
    qr_string: string | null; phone: string | null; updated_at: number;
  } | null ?? { status: "disconnected", qr_string: null, phone: null, updated_at: 0 };

  const alive = botIsAlive();
  const staleSecs = Math.floor(Date.now() / 1000) - (state.updated_at || 0);

  // Auto-sanación: si el bot no responde, disparar reinicio
  const isStuck = !state.qr_string
    && state.status !== "connected"
    && (staleSecs > 60 || !alive);

  if (isStuck) {
    triggerRestart();
  }

  const shouldShowQr = !!state.qr_string && state.status === "qr";

  if (shouldShowQr && state.qr_string) {
    try {
      const qrPng = await QRCode.toDataURL(state.qr_string, { width: 320, margin: 2 });
      return NextResponse.json({ status: "qr", qrPng, updatedAt: state.updated_at, botAlive: alive });
    } catch {}
  }

  return NextResponse.json({
    status: state.status,
    phone: state.phone,
    updatedAt: state.updated_at,
    botAlive: alive,
    staleSecs,
  });
}
