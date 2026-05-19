export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import masterDb, { listCompanies } from "@/lib/master/db-master";

function getCompanyName(slug: string) {
  try { return listCompanies().find(c => c.slug === slug)?.name ?? slug; }
  catch { return slug; }
}

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();

  const isMaster = ctx.me.role === "master";
  const slug = ctx.company;

  if (isMaster) {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const whereClause = status ? "WHERE status = ?" : "";
    const tickets = masterDb.prepare(
      `SELECT * FROM support_tickets ${whereClause} ORDER BY updated_at DESC LIMIT 100`
    ).all(...(status ? [status] : []));
    const counts = masterDb.prepare(
      "SELECT status, COUNT(*) as c FROM support_tickets GROUP BY status"
    ).all() as { status: string; c: number }[];
    return NextResponse.json({ tickets, counts });
  }

  const tickets = masterDb.prepare(
    "SELECT * FROM support_tickets WHERE company_slug=? ORDER BY updated_at DESC"
  ).all(slug);
  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();

  const body = await req.json() as { title: string; description: string; priority?: string; category?: string };
  if (!body.title || !body.description) return NextResponse.json({ error: "Título y descripción requeridos" }, { status: 400 });

  const isMaster = ctx.me.role === "master";
  const slug = ctx.company;
  const num = `TKT-${Date.now().toString(36).toUpperCase()}`;
  const companyName = isMaster ? "Master" : getCompanyName(slug);

  const ticket = masterDb.prepare(`
    INSERT INTO support_tickets (ticket_number, company_slug, company_name, title, description, priority, category)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
  `).get(num, slug, companyName, body.title, body.description, body.priority ?? "medium", body.category ?? null);

  return NextResponse.json({ ticket }, { status: 201 });
}
