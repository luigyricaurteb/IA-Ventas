export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

const BASE = "https://graph.facebook.com/v21.0";

interface WaCfg {
  fb_page_id: string | null;
  fb_page_token: string | null;
  ig_account_id: string | null;
}

// GET — run diagnostics (read-only)
export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const waCfg = db.prepare("SELECT fb_page_id, fb_page_token, ig_account_id FROM whatsapp_config WHERE id=1").get() as WaCfg | null;

  const result = {
    has_page_id: !!waCfg?.fb_page_id,
    has_page_token: !!waCfg?.fb_page_token,
    has_ig_id: !!waCfg?.ig_account_id,
    current_ig_id: waCfg?.ig_account_id ?? null,
    page_name: null as string | null,
    page_token_valid: false,
    ig_linked: false,
    ig_id_from_page: null as string | null,
    ig_id_matches: false,
    fb_permissions: [] as string[],
    errors: [] as string[],
  };

  if (!waCfg?.fb_page_id || !waCfg?.fb_page_token) {
    result.errors.push("Faltan credenciales de Facebook en Ajustes → WhatsApp");
    return NextResponse.json(result);
  }

  // Check page token and get IG business account
  try {
    const pageRes = await fetch(
      `${BASE}/${waCfg.fb_page_id}?fields=name,instagram_business_account&access_token=${waCfg.fb_page_token}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const pageData = await pageRes.json() as {
      name?: string;
      instagram_business_account?: { id: string };
      error?: { message: string; code: number };
    };

    if (pageData.error) {
      result.errors.push(`Token inválido: ${pageData.error.message}`);
    } else {
      result.page_token_valid = true;
      result.page_name = pageData.name ?? null;
      if (pageData.instagram_business_account?.id) {
        result.ig_linked = true;
        result.ig_id_from_page = pageData.instagram_business_account.id;
        result.ig_id_matches = pageData.instagram_business_account.id === waCfg.ig_account_id;
      } else {
        result.errors.push("No hay cuenta de Instagram Business vinculada a esta Página de Facebook. Ve a Configuración de la Página en Facebook → Instagram → Conectar cuenta.");
      }
    }
  } catch (e) {
    result.errors.push(`Error al contactar Facebook: ${(e as Error).message}`);
  }

  // Check permissions on token
  try {
    const permRes = await fetch(
      `${BASE}/me/permissions?access_token=${waCfg.fb_page_token}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const permData = await permRes.json() as {
      data?: { permission: string; status: string }[];
      error?: { message: string };
    };
    if (permData.data) {
      result.fb_permissions = permData.data
        .filter(p => p.status === "granted")
        .map(p => p.permission);

      const needed = ["pages_manage_posts", "pages_read_engagement", "instagram_basic", "instagram_content_publish"];
      const missing = needed.filter(p => !result.fb_permissions.includes(p));
      if (missing.length > 0) {
        result.errors.push(`Permisos faltantes en el token: ${missing.join(", ")}. Necesitas regenerar el token con estos permisos en Facebook Developer.`);
      }
    }
  } catch {}

  return NextResponse.json(result);
}

// POST — auto-fix: save the IG account ID from the linked page
export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const waCfg = db.prepare("SELECT fb_page_id, fb_page_token FROM whatsapp_config WHERE id=1").get() as WaCfg | null;

  if (!waCfg?.fb_page_id || !waCfg?.fb_page_token) {
    return NextResponse.json({ ok: false, error: "Faltan credenciales de Facebook" }, { status: 400 });
  }

  try {
    const pageRes = await fetch(
      `${BASE}/${waCfg.fb_page_id}?fields=instagram_business_account&access_token=${waCfg.fb_page_token}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const pageData = await pageRes.json() as {
      instagram_business_account?: { id: string };
      error?: { message: string };
    };

    if (pageData.error) {
      return NextResponse.json({ ok: false, error: pageData.error.message }, { status: 400 });
    }

    const igId = pageData.instagram_business_account?.id;
    if (!igId) {
      return NextResponse.json({ ok: false, error: "No se encontró cuenta de Instagram Business vinculada a la página" }, { status: 400 });
    }

    db.prepare("UPDATE whatsapp_config SET ig_account_id=? WHERE id=1").run(igId);
    return NextResponse.json({ ok: true, ig_account_id: igId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
