import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const suppliers = db.prepare(
    "SELECT * FROM suppliers ORDER BY created_at DESC"
  ).all();

  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const supplier = db.prepare(`
    INSERT INTO suppliers (name, nit, email, phone, contact_person, rnt, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    RETURNING *
  `).get(
    body.name,
    body.nit           ?? null,
    body.email         ?? null,
    body.phone         ?? null,
    body.contact_person ?? null,
    body.rnt           ?? null,
  );

  return NextResponse.json({ supplier }, { status: 201 });
}
