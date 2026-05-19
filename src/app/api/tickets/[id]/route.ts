export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import masterDb from "@/lib/master/db-master";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const ticket = masterDb.prepare("SELECT * FROM support_tickets WHERE id=?").get(Number(id));
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const messages = masterDb.prepare(
    "SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY created_at ASC"
  ).all(Number(id));

  const attachments = masterDb.prepare(
    "SELECT * FROM ticket_attachments WHERE ticket_id=? ORDER BY created_at ASC"
  ).all(Number(id));

  return NextResponse.json({ ticket, messages, attachments });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json() as Record<string, unknown>;
  const allowed = ["status","priority","assigned_to","category"];
  const fields = Object.keys(body).filter(k => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  const extra = body.status === "resolved" ? ", resolved_at=unixepoch()" : "";
  const sets = fields.map(f => `${f}=?`).join(", ");
  masterDb.prepare(`UPDATE support_tickets SET ${sets}, updated_at=unixepoch()${extra} WHERE id=?`)
    .run(...fields.map(f => body[f]), Number(id));

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  // Add message to ticket
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json() as { content: string; author_name?: string };
  if (!body.content?.trim()) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });

  const authorRole = ctx.me.role === "master" ? "master" : "company";
  const authorName = ctx.me.role === "master" ? "Soporte Hivo" : (body.author_name ?? "Empresa");

  masterDb.prepare(`
    INSERT INTO ticket_messages (ticket_id, author_role, author_name, content) VALUES (?,?,?,?)
  `).run(Number(id), authorRole, authorName, body.content.trim());

  // Update ticket updated_at
  masterDb.prepare("UPDATE support_tickets SET updated_at=unixepoch() WHERE id=?").run(Number(id));

  return NextResponse.json({ ok: true });
}
