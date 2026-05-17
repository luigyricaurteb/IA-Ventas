export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import fs from "node:fs";
import path from "node:path";

// Archivos se guardan en DATA_DIR/uploads/proofs/ (volumen de Railway)
// o en public/uploads/proofs/ si no hay volumen
const DATA_DIR   = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heic",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

interface Ctx { params: Promise<{ filename: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  // Requiere autenticación para ver comprobantes
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return new NextResponse("No autorizado", { status: 401 });

  const { filename } = await params;
  // Sanitizar: solo el nombre del archivo, sin rutas relativas
  const safe = path.basename(filename);

  // Buscar en DATA_DIR primero (Railway volume), luego en public/
  const candidates = [
    path.join(DATA_DIR, "uploads", "proofs", safe),
    path.join(PUBLIC_DIR, "uploads", "proofs", safe),
  ];

  let filePath: string | null = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) { filePath = candidate; break; }
  }

  if (!filePath) return new NextResponse("Archivo no encontrado", { status: 404 });

  const buffer = fs.readFileSync(filePath);
  const ext    = safe.split(".").pop()?.toLowerCase() ?? "";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${safe}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
