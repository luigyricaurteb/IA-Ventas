import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = getCompanyDb(me.company ?? "platform");
  const templates = db.prepare("SELECT * FROM message_templates ORDER BY category, name").all();
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { name, content, category } = await req.json() as { name?: string; content?: string; category?: string };
  if (!name || !content) return NextResponse.json({ error: "Nombre y contenido requeridos" }, { status: 400 });
  const db = getCompanyDb(me.company ?? "platform");
  const tpl = db.prepare("INSERT INTO message_templates (name, content, category) VALUES (?,?,?) RETURNING *")
    .get(name, content, category ?? null);
  return NextResponse.json({ template: tpl }, { status: 201 });
}
