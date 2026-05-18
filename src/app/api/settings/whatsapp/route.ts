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
    wa_phone_display: string | null;
    wa_verified_name: string | null;
    provider: string;
    fb_page_id: string | null;
    fb_page_token: string | null;
    fb_page_name: string | null;
    ig_account_id: string | null;
    ig_username: string | null;
  } | null;

  return NextResponse.json({
    provider:                cfg?.provider ?? "baileys",
    wa_phone_number_id:      cfg?.wa_phone_number_id ?? "",
    wa_phone_display:        cfg?.wa_phone_display ?? "",
    wa_verified_name:        cfg?.wa_verified_name ?? "",
    has_token:               !!(cfg?.wa_access_token),
    wa_access_token_preview: cfg?.wa_access_token ? `${cfg.wa_access_token.slice(0, 8)}...` : "",
    fb_page_id:              cfg?.fb_page_id ?? "",
    fb_page_name:            cfg?.fb_page_name ?? "",
    has_fb_token:            !!(cfg?.fb_page_token),
    ig_account_id:           cfg?.ig_account_id ?? "",
    ig_username:             cfg?.ig_username ?? "",
  });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as Record<string, string>;
  const { action } = body;

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (action === "disconnect_whatsapp") {
    db.prepare("UPDATE whatsapp_config SET provider='baileys', wa_access_token=NULL, wa_phone_number_id=NULL, wa_phone_display=NULL, wa_verified_name=NULL, updated_at=unixepoch() WHERE id=1").run();
    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    const { wa_access_token, wa_phone_number_id } = body;
    if (!wa_access_token || !wa_phone_number_id) return NextResponse.json({ ok: false, error: "Token y Phone Number ID son requeridos" }, { status: 400 });
    return NextResponse.json(await verifyConnection(wa_access_token, wa_phone_number_id));
  }

  if (action === "save") {
    const { wa_access_token, wa_phone_number_id } = body;
    if (!wa_access_token || !wa_phone_number_id) return NextResponse.json({ ok: false, error: "Faltan campos requeridos" }, { status: 400 });
    const verify = await verifyConnection(wa_access_token, wa_phone_number_id);
    if (!verify.ok) return NextResponse.json({ ok: false, error: verify.error }, { status: 400 });
    db.prepare("UPDATE whatsapp_config SET provider='meta', wa_access_token=?, wa_phone_number_id=?, wa_phone_display=?, wa_verified_name=?, updated_at=unixepoch() WHERE id=1")
      .run(wa_access_token, wa_phone_number_id, verify.phone ?? null, verify.name ?? null);
    db.prepare("UPDATE connection_state SET status='connected', phone=?, qr_string=NULL, updated_at=unixepoch() WHERE id=1")
      .run(verify.phone ?? wa_phone_number_id);
    return NextResponse.json({ ok: true, phone: verify.phone, name: verify.name });
  }

  // ── Facebook Messenger ────────────────────────────────────────────────────
  if (action === "save_facebook") {
    const { fb_page_token, fb_page_id } = body;
    if (!fb_page_token) return NextResponse.json({ ok: false, error: "Page Access Token es requerido" }, { status: 400 });

    let realPageId: string | null = null;
    let realToken: string = fb_page_token;
    let pageName: string | null = null;

    try {
      // Intentar primero con /me — funciona si es un Page Token directo
      const r1 = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,category&access_token=${fb_page_token}`, { signal: AbortSignal.timeout(8000) });
      const d1 = await r1.json() as { id?: string; name?: string; category?: string; error?: { message?: string } };

      if (!d1.error && d1.category) {
        // Es un Page Token — tiene categoría
        realPageId = d1.id ?? null;
        pageName   = d1.name ?? null;
      } else {
        // Es un User Token — buscar las páginas del usuario
        const r2 = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${fb_page_token}`, { signal: AbortSignal.timeout(8000) });
        const d2 = await r2.json() as {
          data?: Array<{ id: string; name: string; access_token: string }>;
          error?: { message?: string };
        };

        if (d2.error) return NextResponse.json({ ok: false, error: `Error: ${d2.error.message}. Usa el token de la página desde me/accounts en Graph API Explorer.` }, { status: 400 });

        if (!d2.data?.length) return NextResponse.json({ ok: false, error: "No se encontraron páginas asociadas a este token." }, { status: 400 });

        // Si hay Page ID manual, usar esa página; si no, usar la primera
        const page = fb_page_id
          ? d2.data.find(p => p.id === fb_page_id) ?? d2.data[0]
          : d2.data[0];

        realPageId = page.id;
        pageName   = page.name;
        realToken  = page.access_token; // Token específico de la página
      }
    } catch {
      return NextResponse.json({ ok: false, error: "No se pudo conectar con Facebook. Verifica el token." }, { status: 400 });
    }

    db.prepare("UPDATE whatsapp_config SET fb_page_id=?, fb_page_token=?, fb_page_name=?, updated_at=unixepoch() WHERE id=1")
      .run(realPageId, realToken, pageName);
    return NextResponse.json({ ok: true, page_id: realPageId, page_name: pageName });
  }

  if (action === "disconnect_facebook") {
    db.prepare("UPDATE whatsapp_config SET fb_page_id=NULL, fb_page_token=NULL, fb_page_name=NULL, updated_at=unixepoch() WHERE id=1").run();
    return NextResponse.json({ ok: true });
  }

  // ── Instagram ─────────────────────────────────────────────────────────────
  if (action === "save_instagram") {
    const { ig_account_id, ig_username } = body;
    if (!ig_account_id) return NextResponse.json({ ok: false, error: "Instagram Account ID es requerido" }, { status: 400 });
    db.prepare("UPDATE whatsapp_config SET ig_account_id=?, ig_username=?, updated_at=unixepoch() WHERE id=1")
      .run(ig_account_id, ig_username ?? null);
    return NextResponse.json({ ok: true });
  }

  if (action === "disconnect_instagram") {
    db.prepare("UPDATE whatsapp_config SET ig_account_id=NULL, ig_username=NULL, updated_at=unixepoch() WHERE id=1").run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Acción no reconocida" }, { status: 400 });
}
