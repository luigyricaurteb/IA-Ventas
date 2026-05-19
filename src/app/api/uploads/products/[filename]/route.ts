export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR   = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heic",
  gif: "image/gif", avif: "image/avif",
};

interface Ctx { params: Promise<{ filename: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { filename } = await params;
  const safe = path.basename(filename);

  const candidates = [
    path.join(DATA_DIR, "uploads", "products", safe),
    path.join(PUBLIC_DIR, "uploads", "products", safe),
  ];

  let filePath: string | null = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { filePath = c; break; }
  }

  if (!filePath) return new NextResponse("Imagen no encontrada", { status: 404 });

  const buffer = fs.readFileSync(filePath);
  const ext = safe.split(".").pop()?.toLowerCase() ?? "";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
