export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { setConnectionState } from "@/lib/db";

export async function POST() {
  setConnectionState({ status: "disconnected", qr_string: null, phone: null });

  const authDir = path.resolve(process.cwd(), "auth");
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch {}

  // Crear flag para que el bot detecte y reinicie
  const restartFlag = path.resolve(process.cwd(), "data", ".restart");
  fs.writeFileSync(restartFlag, "");

  return NextResponse.json({ ok: true });
}
