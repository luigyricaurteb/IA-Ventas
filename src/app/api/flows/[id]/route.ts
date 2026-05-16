import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
interface Ctx { params: Promise<{ id: string }> }

function ensureFlowsTable(db: import("better-sqlite3").Database) {
  db.exec("CREATE TABLE IF NOT EXISTS bot_flows (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, steps TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL DEFAULT (unixepoch()))");
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as { name?: string; steps?: unknown[]; active?: number };
  const db = getCompanyDb(me.company ?? "platform");
  ensureFlowsTable(db);

  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined)   { fields.push("name=?");   values.push(body.name); }
  if (body.steps !== undefined)  { fields.push("steps=?");  values.push(JSON.stringify(body.steps)); }
  if (body.active !== undefined) { fields.push("active=?"); values.push(body.active); }
  if (!fields.length) return NextResponse.json({ ok: true });

  values.push(Number(id));
  db.prepare(`UPDATE bot_flows SET ${fields.join(",")} WHERE id=?`).run(...values);
  const flow = db.prepare("SELECT * FROM bot_flows WHERE id=?").get(Number(id)) as { id: number; name: string; active: number; steps: string };
  return NextResponse.json({ flow: { ...flow, steps: JSON.parse(flow.steps) } });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const db = getCompanyDb(me.company ?? "platform");
  ensureFlowsTable(db);
  db.prepare("DELETE FROM bot_flows WHERE id=?").run(Number(id));
  return NextResponse.json({ ok: true });
}
