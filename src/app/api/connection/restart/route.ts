export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db, company } = ctx;

  // 1. Reset connection state en DB → fuerza el bot a pedir nuevo QR
  db.prepare(`
    UPDATE connection_state
    SET status='disconnected', qr_string=NULL, phone=NULL, updated_at=unixepoch()
    WHERE id=1
  `).run();

  // 2. Borrar credenciales de Baileys para esta empresa
  const AUTH_BASE = process.env.AUTH_DIR || path.resolve(process.cwd(), "auth");
  const companyAuthDir = path.join(AUTH_BASE, `company_${company}`);
  try { fs.rmSync(companyAuthDir, { recursive: true, force: true }); } catch {}

  // 3. Escribir el flag de reinicio en múltiples ubicaciones posibles
  const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
  const flagPaths = [
    path.join(DATA_DIR, ".restart"),
    path.resolve(process.cwd(), "data", ".restart"),
    path.resolve(process.cwd(), ".restart"),
  ];

  for (const flagPath of flagPaths) {
    try {
      fs.mkdirSync(path.dirname(flagPath), { recursive: true });
      fs.writeFileSync(flagPath, new Date().toISOString());
      console.log(`[restart] Flag escrito en: ${flagPath}`);
    } catch (e) {
      console.warn(`[restart] No se pudo escribir flag en ${flagPath}:`, e);
    }
  }

  return NextResponse.json({ ok: true, company, message: "Bot reiniciando..." });
}
