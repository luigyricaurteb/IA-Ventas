export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { upsertReservationInSheet } from "@/lib/sheets/sync";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const body = await req.json();

  const allowed = ["deal_id","contact_id","client_name","service_name","service_date",
    "people_count","total_value","status","notes"];
  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  const sets = fields.map((f) => `${f} = ?`).join(", ");
  db.prepare(
    `UPDATE reservations SET ${sets}, updated_at = unixepoch() WHERE id = ?`
  ).run(...fields.map((f) => body[f]), Number(id));

  // Auto-sync to Google Sheet if enabled
  const sheetCfg = db.prepare("SELECT sheets_url, sheets_enabled FROM company_config WHERE id=1").get() as { sheets_url: string | null; sheets_enabled: number } | null;
  if (sheetCfg?.sheets_enabled === 1 && sheetCfg.sheets_url) {
    upsertReservationInSheet(db, sheetCfg.sheets_url, Number(id))
      .catch((e) => console.error("[sheets] auto-sync error:", (e as Error).message));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  db.prepare("DELETE FROM reservations WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
