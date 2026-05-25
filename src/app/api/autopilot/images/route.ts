export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const images = db.prepare("SELECT * FROM autopilot_images WHERE active=1 ORDER BY order_index ASC, id ASC").all();
  return NextResponse.json({ images });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // Facebook /photos y Instagram solo aceptan JPEG y PNG
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "No se envió imagen" }, { status: 400 });

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido. Usa JPG o PNG (Facebook e Instagram no aceptan WebP)." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "La imagen no debe superar 10 MB." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
  const ext = extMap[file.type] ?? "jpg";
  const filename = `ap_${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`;
  const uploadDir = path.join(DATA_DIR, "uploads", "autopilot");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), buffer);

  const maxOrder = (db.prepare("SELECT COALESCE(MAX(order_index),0) as m FROM autopilot_images WHERE active=1").get() as { m: number }).m;
  const image = db.prepare(
    "INSERT INTO autopilot_images (filename, original_name, order_index) VALUES (?,?,?) RETURNING *"
  ).get(filename, file.name, maxOrder + 1);

  return NextResponse.json({ image }, { status: 201 });
}
