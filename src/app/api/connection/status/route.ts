import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const state = db.prepare("SELECT * FROM connection_state WHERE id = 1").get() as {
    status: "disconnected" | "qr" | "connecting" | "connected";
    qr_string: string | null; phone: string | null; updated_at: number;
  } | null ?? { status: "disconnected", qr_string: null, phone: null, updated_at: 0 };

  // Defensivo: mostrar QR si qr_string existe aunque status no sea exactamente 'qr'
  const shouldShowQr =
    !!state.qr_string &&
    (state.status === "qr" || state.status === "connecting");

  if (shouldShowQr && state.qr_string) {
    const qrPng = await QRCode.toDataURL(state.qr_string, {
      width: 320,
      margin: 2,
    });
    return NextResponse.json({
      status: "qr",
      qrPng,
      updatedAt: state.updated_at,
    });
  }

  return NextResponse.json({
    status: state.status,
    phone: state.phone,
    updatedAt: state.updated_at,
  });
}
