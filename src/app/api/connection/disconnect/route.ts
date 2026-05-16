export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  db.prepare(
    "UPDATE connection_state SET status = 'disconnected', qr_string = NULL, phone = NULL, updated_at = unixepoch() WHERE id = 1"
  ).run();

  const authDir = process.env.AUTH_DIR || path.resolve(process.cwd(), "auth");
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch {}

  // Crear flag para que el bot detecte y reinicie
  const restartFlag = path.resolve(process.cwd(), "data", ".restart");
  fs.writeFileSync(restartFlag, "");

  return NextResponse.json({ ok: true });
}
