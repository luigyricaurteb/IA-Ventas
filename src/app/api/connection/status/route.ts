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

  const waConfig = db.prepare(
    "SELECT provider, wa_access_token, wa_phone_number_id, wa_phone_display FROM whatsapp_config WHERE id=1"
  ).get() as {
    provider: string;
    wa_access_token: string | null;
    wa_phone_number_id: string | null;
    wa_phone_display: string | null;
  } | null;

  // Env vars solo aplican si esta empresa tiene provider='meta' en su propia DB
  // Evita que credenciales globales (de otra empresa) contaminen la plataforma master
  const isMeta = waConfig?.provider === "meta";
  const envToken   = isMeta ? process.env.WHATSAPP_ACCESS_TOKEN : null;
  const envPhoneId = isMeta ? process.env.WHATSAPP_PHONE_NUMBER_ID : null;
  const metaToken   = waConfig?.wa_access_token || envToken;
  const metaPhoneId = waConfig?.wa_phone_number_id || envPhoneId;

  if (isMeta && metaToken && metaPhoneId) {  // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    const phone = waConfig?.wa_phone_display ?? metaPhoneId;

    // Sincronizar DB con env vars si están configuradas en Railway
    if (envToken && envPhoneId && waConfig?.provider !== "meta") {
      try {
        db.prepare(
          "UPDATE whatsapp_config SET provider='meta', wa_access_token=?, wa_phone_number_id=?, updated_at=unixepoch() WHERE id=1"
        ).run(envToken, envPhoneId);
      } catch {}
    }

    db.prepare(
      "UPDATE connection_state SET status='connected', phone=?, qr_string=NULL, updated_at=unixepoch() WHERE id=1"
    ).run(phone);

    return NextResponse.json({
      status: "connected",
      phone,
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
