import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

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
    const updates: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (key !== "logo") updates[key] = value;
    }

    if (logoFile) {
      const bytes = await logoFile.arrayBuffer();
      const ext = logoFile.name.split(".").pop() ?? "png";
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
    const body = await req.json();
    const fields = Object.keys(body);
    if (fields.length > 0) {
      const sets = fields.map((f) => `${f} = ?`).join(", ");
      db.prepare(`UPDATE company_config SET ${sets}, updated_at = unixepoch() WHERE id = 1`).run(
        ...fields.map((f) => body[f]),
      );
    }
  }

  const config = db.prepare("SELECT * FROM company_config WHERE id = 1").get();
  return NextResponse.json({ config });
}
