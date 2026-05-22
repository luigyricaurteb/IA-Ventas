import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// Only these fields may be updated by company users via Settings.
// Master-only fields (audio_transcription_enabled, autopilot_enabled, admin_mode_*) are NOT here.
const ALLOWED_FIELDS = new Set([
  "name", "ai_name", "ai_general_instructions",
  "phone", "email", "address", "website",
  "nequi_phone", "daviplata_phone",
  "groq_api_key", "openrouter_api_key", "openrouter_model",
  "meta_access_token", "meta_phone_number_id", "meta_waba_id",
  "meta_webhook_verify_token", "meta_page_id", "meta_ig_user_id",
  "meta_fb_page_token",
  "timezone", "currency", "language",
]);

const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB

function filterFields(raw: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (ALLOWED_FIELDS.has(key)) safe[key] = raw[key];
  }
  return safe;
}

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const config = db.prepare("SELECT * FROM company_config WHERE id = 1").get();
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const logoFile = formData.get("logo") as File | null;
    const raw: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (key !== "logo") raw[key] = value;
    }

    const updates = filterFields(raw);

    if (logoFile) {
      if (!ALLOWED_LOGO_TYPES.has(logoFile.type)) {
        return NextResponse.json({ error: "Tipo de archivo no permitido. Usa JPG, PNG o WebP." }, { status: 400 });
      }
      if (logoFile.size > MAX_LOGO_SIZE) {
        return NextResponse.json({ error: "El logo no debe superar 5 MB." }, { status: 400 });
      }

      const bytes = await logoFile.arrayBuffer();
      const ext = logoFile.name.split(".").pop()?.toLowerCase() ?? "png";
      const allowedExts = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
      if (!allowedExts.has(ext)) {
        return NextResponse.json({ error: "Extensión de archivo no permitida." }, { status: 400 });
      }

      const filename = `logo_${Date.now()}.${ext}`;
      const dir = path.resolve(process.cwd(), "public", "uploads", "logos");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), Buffer.from(bytes));
      updates.logo_filename = filename;
    }

    if (Object.keys(updates).length > 0) {
      const fields = Object.keys(updates);
      const sets = fields.map((f) => `${f} = ?`).join(", ");
      db.prepare(`UPDATE company_config SET ${sets}, updated_at = unixepoch() WHERE id = 1`).run(
        ...fields.map((f) => updates[f]),
      );
    }
  } else {
    const body = await req.json() as Record<string, unknown>;
    const updates = filterFields(body);

    if (Object.keys(updates).length > 0) {
      const fields = Object.keys(updates);
      const sets = fields.map((f) => `${f} = ?`).join(", ");
      db.prepare(`UPDATE company_config SET ${sets}, updated_at = unixepoch() WHERE id = 1`).run(
        ...fields.map((f) => updates[f]),
      );
    }
  }

  const config = db.prepare("SELECT * FROM company_config WHERE id = 1").get();
  return NextResponse.json({ config });
}
