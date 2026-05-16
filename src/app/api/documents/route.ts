import { NextRequest, NextResponse } from "next/server";
import { listLegalDocuments, insertLegalDocument } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ documents: listLegalDocuments() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title || !body.content) {
    return NextResponse.json({ error: "Título y contenido requeridos" }, { status: 400 });
  }
  const doc = insertLegalDocument({
    type: body.type ?? "data_treatment",
    title: body.title,
    content: body.content,
    version: body.version ?? "1.0",
    active: body.active !== false ? 1 : 0,
  });
  return NextResponse.json({ document: doc }, { status: 201 });
}
