export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { getServiceAccountEmail } from "@/lib/sheets/sync";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const cfg = db.prepare(
    "SELECT sheets_url, sheets_enabled, sheets_last_sync FROM company_config WHERE id=1"
  ).get() as { sheets_url: string | null; sheets_enabled: number; sheets_last_sync: number | null } | null;

  return NextResponse.json({
    sheets_url: cfg?.sheets_url ?? null,
    sheets_enabled: (cfg?.sheets_enabled ?? 0) === 1,
    sheets_last_sync: cfg?.sheets_last_sync ?? null,
    service_account_email: getServiceAccountEmail(),
  });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as { sheets_url?: string; sheets_enabled?: boolean };

  const existing = db.prepare("SELECT id FROM company_config WHERE id=1").get();
  if (!existing) {
    db.prepare("INSERT INTO company_config (id) VALUES (1)").run();
  }

  if (body.sheets_url !== undefined) {
    db.prepare("UPDATE company_config SET sheets_url=? WHERE id=1").run(body.sheets_url || null);
  }
  if (body.sheets_enabled !== undefined) {
    db.prepare("UPDATE company_config SET sheets_enabled=? WHERE id=1").run(body.sheets_enabled ? 1 : 0);
  }

  return NextResponse.json({ ok: true });
}
