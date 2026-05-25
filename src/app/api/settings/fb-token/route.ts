export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

const BASE = "https://graph.facebook.com/v21.0";

// Intercambia un token corto (usuario) por un Page Access Token permanente.
// Flujo: short-lived user token → long-lived user token (60d) → page access token (permanente)
export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as {
    action: "save_app" | "exchange" | "status";
    fb_app_id?: string;
    fb_app_secret?: string;
    fb_user_token?: string;
    fb_page_id?: string;
  };

  // ── Guardar App ID y App Secret ───────────────────────────────────────────
  if (body.action === "save_app") {
    if (!body.fb_app_id || !body.fb_app_secret)
      return NextResponse.json({ ok: false, error: "App ID y App Secret son requeridos" }, { status: 400 });
    db.prepare("UPDATE whatsapp_config SET fb_app_id=?, fb_app_secret=?, updated_at=unixepoch() WHERE id=1")
      .run(body.fb_app_id, body.fb_app_secret);
    return NextResponse.json({ ok: true });
  }

  // ── Estado del token actual ───────────────────────────────────────────────
  if (body.action === "status") {
    const cfg = db.prepare("SELECT fb_app_id, fb_app_secret, fb_token_expires_at, fb_page_token, fb_page_name FROM whatsapp_config WHERE id=1")
      .get() as { fb_app_id: string | null; fb_app_secret: string | null; fb_token_expires_at: number | null; fb_page_token: string | null; fb_page_name: string | null } | null;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = cfg?.fb_token_expires_at ?? null;
    const daysLeft = expiresAt ? Math.ceil((expiresAt - now) / 86400) : null;

    return NextResponse.json({
      has_app_credentials: !!(cfg?.fb_app_id && cfg?.fb_app_secret),
      has_page_token: !!(cfg?.fb_page_token),
      page_name: cfg?.fb_page_name ?? null,
      expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      days_left: daysLeft,
      is_permanent: expiresAt === null && !!(cfg?.fb_page_token),
    });
  }

  // ── Intercambio completo: user token → page token permanente ──────────────
  if (body.action === "exchange") {
    if (!body.fb_user_token)
      return NextResponse.json({ ok: false, error: "El token de usuario es requerido" }, { status: 400 });

    const cfg = db.prepare("SELECT fb_app_id, fb_app_secret, fb_page_id FROM whatsapp_config WHERE id=1")
      .get() as { fb_app_id: string | null; fb_app_secret: string | null; fb_page_id: string | null } | null;

    const appId     = body.fb_app_id     ?? cfg?.fb_app_id;
    const appSecret = body.fb_app_secret ?? cfg?.fb_app_secret;
    const pageId    = body.fb_page_id    ?? cfg?.fb_page_id;

    if (!appId || !appSecret)
      return NextResponse.json({ ok: false, error: "Configura primero el App ID y App Secret" }, { status: 400 });

    // Paso 1: Intercambiar por token de larga duración (60 días)
    let longLivedToken: string;
    let tokenExpiry: number | null = null;
    try {
      const r = await fetch(
        `${BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${body.fb_user_token}`,
        { signal: AbortSignal.timeout(15000) }
      );
      const d = await r.json() as { access_token?: string; expires_in?: number; error?: { message: string } };
      if (!d.access_token) return NextResponse.json({ ok: false, error: `Error al extender token: ${d.error?.message ?? "respuesta inválida"}` }, { status: 400 });
      longLivedToken = d.access_token;
      tokenExpiry = d.expires_in ? Math.floor(Date.now() / 1000) + d.expires_in : null;
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Error de conexión con Facebook: ${(e as Error).message}` }, { status: 502 });
    }

    // Paso 2: Obtener Page Access Token (permanente si viene de token de larga duración)
    try {
      const r = await fetch(`${BASE}/me/accounts?access_token=${longLivedToken}`, { signal: AbortSignal.timeout(15000) });
      const d = await r.json() as { data?: { id: string; name: string; access_token: string }[]; error?: { message: string } };
      if (!d.data?.length) return NextResponse.json({ ok: false, error: `No se encontraron páginas: ${d.error?.message ?? "sin páginas asociadas"}` }, { status: 400 });

      // Buscar la página correcta o usar la primera disponible
      const page = pageId
        ? (d.data.find(p => p.id === pageId) ?? d.data[0])
        : d.data[0];

      const pageToken = page.access_token;

      // Verificar si el page token es permanente (sin expiración)
      const debugR = await fetch(`${BASE}/debug_token?input_token=${pageToken}&access_token=${appId}|${appSecret}`, { signal: AbortSignal.timeout(10000) });
      const debugD = await debugR.json() as { data?: { expires_at?: number; is_valid?: boolean } };
      const pageExpiry = debugD.data?.expires_at && debugD.data.expires_at > 0 ? debugD.data.expires_at : null;

      // Guardar todo
      db.prepare(`
        UPDATE whatsapp_config SET
          fb_page_id=?, fb_page_token=?, fb_page_name=?,
          fb_user_token=?, fb_token_expires_at=?,
          updated_at=unixepoch()
        WHERE id=1
      `).run(page.id, pageToken, page.name, longLivedToken, pageExpiry);

      return NextResponse.json({
        ok: true,
        page_id: page.id,
        page_name: page.name,
        is_permanent: pageExpiry === null,
        expires_at: pageExpiry ? new Date(pageExpiry * 1000).toISOString() : null,
        pages_found: d.data.map(p => ({ id: p.id, name: p.name })),
      });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Error obteniendo página: ${(e as Error).message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: false, error: "Acción no reconocida" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const cfg = db.prepare("SELECT fb_app_id, fb_app_secret, fb_token_expires_at, fb_page_token, fb_page_name FROM whatsapp_config WHERE id=1")
    .get() as { fb_app_id: string | null; fb_app_secret: string | null; fb_token_expires_at: number | null; fb_page_token: string | null; fb_page_name: string | null } | null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = cfg?.fb_token_expires_at ?? null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt - now) / 86400) : null;

  return NextResponse.json({
    fb_app_id: cfg?.fb_app_id ?? "",
    has_app_secret: !!(cfg?.fb_app_secret),
    has_page_token: !!(cfg?.fb_page_token),
    page_name: cfg?.fb_page_name ?? null,
    expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    days_left: daysLeft,
    is_permanent: expiresAt === null && !!(cfg?.fb_page_token),
    token_status: !cfg?.fb_page_token ? "no_token"
      : expiresAt === null ? "permanent"
      : daysLeft !== null && daysLeft <= 7 ? "expiring_soon"
      : "active",
  });
}
