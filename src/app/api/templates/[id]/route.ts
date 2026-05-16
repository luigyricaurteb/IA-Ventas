import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const db = getCompanyDb(me.company ?? "platform");
  db.prepare("DELETE FROM message_templates WHERE id=?").run(Number(id));
  return NextResponse.json({ ok: true });
}
