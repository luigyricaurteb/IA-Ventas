import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function ensureFlowsTable(db: import("better-sqlite3").Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      steps TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

export async function GET(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = getCompanyDb(me.company ?? "platform");
  ensureFlowsTable(db);
  const rows = db.prepare("SELECT * FROM bot_flows ORDER BY name").all() as { id: number; name: string; active: number; steps: string }[];
  const flows = rows.map(r => ({ ...r, steps: JSON.parse(r.steps) }));
  return NextResponse.json({ flows });
}

export async function POST(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json() as { name?: string; steps?: unknown[]; active?: number };
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const db = getCompanyDb(me.company ?? "platform");
  ensureFlowsTable(db);
  const flow = db.prepare("INSERT INTO bot_flows (name, steps, active) VALUES (?,?,?) RETURNING *")
    .get(body.name, JSON.stringify(body.steps ?? []), body.active ?? 1) as { id: number; name: string; active: number; steps: string };
  return NextResponse.json({ flow: { ...flow, steps: JSON.parse(flow.steps) } }, { status: 201 });
}
