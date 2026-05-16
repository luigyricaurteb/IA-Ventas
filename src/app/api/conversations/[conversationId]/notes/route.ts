import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
interface Ctx { params: Promise<{ conversationId: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const id = Number(conversationId);
  const { content } = await req.json() as { content?: string };
  if (!content?.trim()) return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });

  const db = getCompanyDb(me.company ?? "platform");
  const note = db.prepare(
    "INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?) RETURNING *"
  ).get(id, "note", content.trim());

  return NextResponse.json({ note }, { status: 201 });
}
