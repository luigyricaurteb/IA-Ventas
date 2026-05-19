export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { verifySheetAccess } from "@/lib/sheets/sync";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as { sheets_url?: string };

  const url = body.sheets_url
    ?? (db.prepare("SELECT sheets_url FROM company_config WHERE id=1").get() as { sheets_url: string | null } | null)?.sheets_url
    ?? "";

  if (!url) {
    return NextResponse.json({ ok: false, error: "Ingresa primero el link de tu Google Sheet" });
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({
      ok: false,
      error: "Variable GOOGLE_SERVICE_ACCOUNT_JSON no configurada en Railway. Agrégala en Settings → Variables.",
    });
  }

  const result = await verifySheetAccess(url);
  return NextResponse.json(result);
}
