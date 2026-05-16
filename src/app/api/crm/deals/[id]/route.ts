import { NextRequest, NextResponse } from "next/server";
import { updateDealStage, addDealNote, getDealActivities, type CrmStage } from "@/lib/db";
import db from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const deal = db.prepare("SELECT * FROM crm_deals WHERE id = ?").get(Number(id));
  if (!deal) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const activities = getDealActivities(Number(id));
  return NextResponse.json({ deal, activities });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  if (body.stage) {
    const validStages = ["NUEVO","CALIFICADO","PROPUESTA","NEGOCIACION","GANADO","PERDIDO"];
    if (!validStages.includes(body.stage)) {
      return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
    }
    updateDealStage(Number(id), body.stage as CrmStage, body.lost_reason);
  }

  if (body.note) {
    addDealNote(Number(id), body.note);
  }

  return NextResponse.json({ ok: true });
}
