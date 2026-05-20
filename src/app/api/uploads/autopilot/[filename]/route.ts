export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", avif: "image/avif",
};

interface Ctx { params: Promise<{ filename: string }> }

// Público — Meta necesita acceder a la URL de la imagen para publicar
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { filename } = await params;
  const safe = path.basename(filename);
  const filePath = path.join(DATA_DIR, "uploads", "autopilot", safe);
  if (!fs.existsSync(filePath)) return new NextResponse("Not found", { status: 404 });

  const buffer = fs.readFileSync(filePath);
  const ext = safe.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
