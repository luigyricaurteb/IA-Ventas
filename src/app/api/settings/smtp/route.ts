import { NextRequest, NextResponse } from "next/server";
import { getSmtpConfig, updateSmtpConfig } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getSmtpConfig();
  return NextResponse.json({ config: { ...config, password: config.password ? "••••••••" : "" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const update: Record<string, unknown> = {};
  const fields = ["host","port","secure","user","from_name","from_email"] as const;
  for (const f of fields) if (body[f] !== undefined) update[f] = body[f];
  if (body.password && body.password !== "••••••••") update.password = body.password;
  updateSmtpConfig(update);
  return NextResponse.json({ ok: true });
}
