export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const deal = db.prepare("SELECT * FROM crm_deals WHERE id = ?").get(Number(id));
  if (!deal) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const activities = db.prepare(
    "SELECT * FROM crm_activities WHERE deal_id = ? ORDER BY created_at ASC"
  ).all(Number(id));

  return NextResponse.json({ deal, activities });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const body = await req.json();

  if (body.stage) {
    const validStages = ["NUEVO","CALIFICADO","PROPUESTA","NEGOCIACION","GANADO","PERDIDO"];
    if (!validStages.includes(body.stage)) {
      return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
    }

    db.prepare(
      "UPDATE crm_deals SET stage = ?, lost_reason = ?, stage_changed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?"
    ).run(body.stage, body.lost_reason ?? null, Number(id));

    db.prepare(
      "INSERT INTO crm_activities (deal_id, type, description) VALUES (?, 'stage_change', ?)"
    ).run(Number(id), `Etapa cambiada a ${body.stage}${body.lost_reason ? `: ${body.lost_reason}` : ""}`);
  }

  if (body.note) {
    db.prepare(
      "INSERT INTO crm_activities (deal_id, type, description) VALUES (?, 'note', ?)"
    ).run(Number(id), body.note);
    db.prepare(
      "UPDATE crm_deals SET updated_at = unixepoch() WHERE id = ?"
    ).run(Number(id));
  }

  return NextResponse.json({ ok: true });
}
