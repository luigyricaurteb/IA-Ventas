export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR    = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const PAIRING_REQ = path.join(DATA_DIR, ".pairing_req");
const PAIRING_RESP = path.join(DATA_DIR, ".pairing_resp");

// POST: solicitar pairing code — body { phone: "573006150725" }
export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();

  const { phone } = await req.json() as { phone?: string };
  if (!phone) return NextResponse.json({ error: "Falta el número de teléfono" }, { status: 400 });

  const clean = phone.replace(/\D/g, "");
  if (clean.length < 10) return NextResponse.json({ error: "Número inválido" }, { status: 400 });

  // Borrar respuesta anterior
  try { fs.unlinkSync(PAIRING_RESP); } catch {}

  // Escribir solicitud al proceso del bot
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PAIRING_REQ, `${ctx.company}|${clean}`);
  } catch (e) {
    return NextResponse.json({ error: "Error al comunicarse con el bot" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Solicitando código..." });
}

// GET: obtener el código generado (polling cada 1s desde el frontend)
export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();

  try {
    if (!fs.existsSync(PAIRING_RESP)) {
      return NextResponse.json({ ready: false });
    }
    const content = fs.readFileSync(PAIRING_RESP, "utf8").trim();
    if (content.startsWith("ERROR:")) {
      return NextResponse.json({ ready: false, error: content.slice(6) });
    }
    // Formatear como XXXX-XXXX para mejor legibilidad
    const formatted = content.length === 8
      ? `${content.slice(0, 4)}-${content.slice(4)}`
      : content;
    return NextResponse.json({ ready: true, code: formatted });
  } catch {
    return NextResponse.json({ ready: false });
  }
}
