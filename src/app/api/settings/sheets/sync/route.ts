export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { exportReservationsToSheet, importReservationsFromSheet } from "@/lib/sheets/sync";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as { action?: string };
  const action = body.action ?? "export";

  const cfg = db.prepare("SELECT sheets_url FROM company_config WHERE id=1").get() as { sheets_url: string | null } | null;
  if (!cfg?.sheets_url) {
    return NextResponse.json({ ok: false, error: "No hay hoja configurada. Configura el link primero." });
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({
      ok: false,
      error: "GOOGLE_SERVICE_ACCOUNT_JSON no configurado en Railway.",
    });
  }

  if (action === "import") {
    const result = await importReservationsFromSheet(db, cfg.sheets_url);
    if (result.ok) {
      db.prepare("UPDATE company_config SET sheets_last_sync=? WHERE id=1").run(Math.floor(Date.now() / 1000));
    }
    return NextResponse.json(result);
  }

  // default: export
  const result = await exportReservationsToSheet(db, cfg.sheets_url);
  if (result.ok) {
    db.prepare("UPDATE company_config SET sheets_last_sync=? WHERE id=1").run(Math.floor(Date.now() / 1000));
  }
  return NextResponse.json(result);
}
