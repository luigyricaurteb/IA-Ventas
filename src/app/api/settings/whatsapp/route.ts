export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { verifyConnection } from "@/lib/whatsapp/meta-api";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const cfg = db.prepare("SELECT * FROM whatsapp_config WHERE id=1").get() as {
    wa_access_token: string | null;
    wa_phone_number_id: string | null;
    wa_business_account_id: string | null;
    wa_phone_display: string | null;
    wa_verified_name: string | null;
    provider: string;
  } | null;

  return NextResponse.json({
    provider: cfg?.provider ?? "baileys",
    wa_phone_number_id: cfg?.wa_phone_number_id ?? "",
    wa_phone_display: cfg?.wa_phone_display ?? "",
    wa_verified_name: cfg?.wa_verified_name ?? "",
    // No devolver el token completo por seguridad
    has_token: !!(cfg?.wa_access_token),
    wa_access_token_preview: cfg?.wa_access_token ? `${cfg.wa_access_token.slice(0, 8)}...` : "",
  });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as {
    provider?: string;
    wa_access_token?: string;
    wa_phone_number_id?: string;
    wa_business_account_id?: string;
    action?: "verify" | "save" | "disconnect";
  };

  if (body.action === "disconnect") {
    db.prepare(`UPDATE whatsapp_config SET
      provider='baileys', wa_access_token=NULL,
      wa_phone_number_id=NULL, wa_business_account_id=NULL,
      wa_phone_display=NULL, wa_verified_name=NULL, updated_at=unixepoch()
      WHERE id=1`).run();
    return NextResponse.json({ ok: true });
  }

  if (body.action === "verify") {
    if (!body.wa_access_token || !body.wa_phone_number_id) {
      return NextResponse.json({ ok: false, error: "Token y Phone Number ID son requeridos" }, { status: 400 });
    }
    const result = await verifyConnection(body.wa_access_token, body.wa_phone_number_id);
    return NextResponse.json(result);
  }

  // Guardar configuración
  if (!body.wa_access_token || !body.wa_phone_number_id) {
    return NextResponse.json({ ok: false, error: "Faltan campos requeridos" }, { status: 400 });
  }

  // Verificar antes de guardar
  const verify = await verifyConnection(body.wa_access_token, body.wa_phone_number_id);
  if (!verify.ok) {
    return NextResponse.json({ ok: false, error: verify.error }, { status: 400 });
  }

  db.prepare(`UPDATE whatsapp_config SET
    provider='meta',
    wa_access_token=?,
    wa_phone_number_id=?,
    wa_business_account_id=?,
    wa_phone_display=?,
    wa_verified_name=?,
    updated_at=unixepoch()
    WHERE id=1`).run(
    body.wa_access_token,
    body.wa_phone_number_id,
    body.wa_business_account_id ?? null,
    verify.phone ?? null,
    verify.name ?? null,
  );

  // También actualizar connection_state para que el dashboard muestre "connected"
  db.prepare("UPDATE connection_state SET status='connected', phone=?, qr_string=NULL, updated_at=unixepoch() WHERE id=1")
    .run(verify.phone ?? body.wa_phone_number_id);

  return NextResponse.json({ ok: true, phone: verify.phone, name: verify.name });
}
