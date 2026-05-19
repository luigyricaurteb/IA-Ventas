export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import masterDb from "@/lib/master/db-master";

interface GatewayCfg {
  mercadopago_public_key: string | null; mercadopago_access_token: string | null; mercadopago_active: number;
  wompi_public_key: string | null; wompi_private_key: string | null; wompi_events_key: string | null; wompi_active: number;
}

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx || ctx.me.role !== "master") return unauthorized();

  const cfg = masterDb.prepare("SELECT * FROM gateway_config WHERE id=1").get() as GatewayCfg | null;
  // Mask secrets
  return NextResponse.json({
    mercadopago_public_key: cfg?.mercadopago_public_key ?? "",
    mercadopago_access_token: cfg?.mercadopago_access_token ? "••••••••" : "",
    mercadopago_active: cfg?.mercadopago_active === 1,
    wompi_public_key: cfg?.wompi_public_key ?? "",
    wompi_private_key: cfg?.wompi_private_key ? "••••••••" : "",
    wompi_events_key: cfg?.wompi_events_key ? "••••••••" : "",
    wompi_active: cfg?.wompi_active === 1,
  });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx || ctx.me.role !== "master") return unauthorized();

  const body = await req.json() as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (body.mercadopago_public_key !== undefined) updates.mercadopago_public_key = body.mercadopago_public_key || null;
  if (body.mercadopago_access_token && body.mercadopago_access_token !== "••••••••") updates.mercadopago_access_token = body.mercadopago_access_token;
  if (body.mercadopago_active !== undefined) updates.mercadopago_active = body.mercadopago_active ? 1 : 0;
  if (body.wompi_public_key !== undefined) updates.wompi_public_key = body.wompi_public_key || null;
  if (body.wompi_private_key && body.wompi_private_key !== "••••••••") updates.wompi_private_key = body.wompi_private_key;
  if (body.wompi_events_key && body.wompi_events_key !== "••••••••") updates.wompi_events_key = body.wompi_events_key;
  if (body.wompi_active !== undefined) updates.wompi_active = body.wompi_active ? 1 : 0;

  const fields = Object.keys(updates);
  if (fields.length > 0) {
    const sets = fields.map(f => `${f}=?`).join(", ");
    masterDb.prepare(`UPDATE gateway_config SET ${sets}, updated_at=unixepoch() WHERE id=1`).run(...fields.map(f => updates[f]));
  }

  return NextResponse.json({ ok: true });
}
