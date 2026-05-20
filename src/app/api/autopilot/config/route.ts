export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  db.prepare("INSERT OR IGNORE INTO autopilot_config (id) VALUES (1)").run();
  const cfg = db.prepare("SELECT * FROM autopilot_config WHERE id=1").get();
  return NextResponse.json({ config: cfg });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  db.prepare("INSERT OR IGNORE INTO autopilot_config (id) VALUES (1)").run();
  const body = await req.json() as Record<string, unknown>;
  const allowed = ["enabled","tone","frequency","posting_hour","publish_facebook","publish_instagram","auto_approve"];
  const fields = Object.keys(body).filter(k => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  const sets = fields.map(f => `${f}=?`).join(", ");
  db.prepare(`UPDATE autopilot_config SET ${sets}, updated_at=unixepoch() WHERE id=1`).run(...fields.map(f => body[f]));
  return NextResponse.json({ ok: true });
}
