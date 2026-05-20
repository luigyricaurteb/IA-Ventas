export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;
  const { id } = await params;

  const img = db.prepare("SELECT filename FROM autopilot_images WHERE id=?").get(Number(id)) as { filename: string } | null;
  if (img) {
    try { fs.unlinkSync(path.join(DATA_DIR, "uploads", "autopilot", img.filename)); } catch {}
  }
  db.prepare("DELETE FROM autopilot_images WHERE id=?").run(Number(id));
  return NextResponse.json({ ok: true });
}
