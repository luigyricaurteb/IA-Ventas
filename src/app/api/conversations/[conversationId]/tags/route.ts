import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
interface Ctx { params: Promise<{ conversationId: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const db = getCompanyDb(me.company ?? "platform");
  const conv = db.prepare("SELECT tags FROM conversations WHERE id=?").get(Number(conversationId)) as { tags: string } | null;
  const tags: string[] = JSON.parse(conv?.tags ?? "[]");
  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const { tag } = await req.json() as { tag?: string };
  if (!tag?.trim()) return NextResponse.json({ error: "Tag requerido" }, { status: 400 });

  const db = getCompanyDb(me.company ?? "platform");
  const conv = db.prepare("SELECT tags FROM conversations WHERE id=?").get(Number(conversationId)) as { tags: string } | null;
  if (!conv) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const tags: string[] = JSON.parse(conv.tags ?? "[]");
  if (!tags.includes(tag.trim())) {
    tags.push(tag.trim());
    db.prepare("UPDATE conversations SET tags=? WHERE id=?").run(JSON.stringify(tags), Number(conversationId));
  }
  return NextResponse.json({ tags });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const { tag } = await req.json() as { tag?: string };
  const db = getCompanyDb(me.company ?? "platform");
  const conv = db.prepare("SELECT tags FROM conversations WHERE id=?").get(Number(conversationId)) as { tags: string } | null;
  if (!conv) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const tags: string[] = JSON.parse(conv.tags ?? "[]").filter((t: string) => t !== tag);
  db.prepare("UPDATE conversations SET tags=? WHERE id=?").run(JSON.stringify(tags), Number(conversationId));
  return NextResponse.json({ tags });
}
