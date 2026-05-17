import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const config = db.prepare("SELECT * FROM smtp_config WHERE id = 1").get() as {
    host: string | null; port: number; secure: number;
    user: string | null; password: string | null;
    from_name: string | null; from_email: string | null; updated_at: number;
  } | null ?? { host: null, port: 587, secure: 0, user: null, password: null, from_name: null, from_email: null, updated_at: 0 };

  return NextResponse.json({ config: { ...config, password: config.password ? "••••••••" : "" } });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  const update: Record<string, unknown> = {};
  const fields = ["host","port","secure","user","from_name","from_email","provider","resend_from"] as const;
  for (const f of fields) if (body[f] !== undefined) update[f] = body[f];
  if (body.password && body.password !== "••••••••") update.password = body.password;
  if (body.resend_api_key && body.resend_api_key !== "••••••••") update.resend_api_key = body.resend_api_key;

  if (Object.keys(update).length > 0) {
    const fieldNames = Object.keys(update);
    const sets = fieldNames.map((f) => `${f} = ?`).join(", ");
    db.prepare(`UPDATE smtp_config SET ${sets}, updated_at = unixepoch() WHERE id = 1`).run(
      ...fieldNames.map((f) => update[f]),
    );
  }

  return NextResponse.json({ ok: true });
}
