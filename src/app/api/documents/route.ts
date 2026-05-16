import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const documents = db.prepare(
    "SELECT * FROM legal_documents ORDER BY created_at DESC"
  ).all();

  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json();
  if (!body.title || !body.content) {
    return NextResponse.json({ error: "Título y contenido requeridos" }, { status: 400 });
  }

  const doc = db.prepare(`
    INSERT INTO legal_documents (type, title, content, version, active)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    body.type ?? "data_treatment",
    body.title,
    body.content,
    body.version ?? "1.0",
    body.active !== false ? 1 : 0,
  );

  return NextResponse.json({ document: doc }, { status: 201 });
}
