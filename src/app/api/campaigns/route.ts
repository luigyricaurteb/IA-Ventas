import { NextRequest, NextResponse } from "next/server";
import { listCampaigns, insertCampaign } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ campaigns: listCampaigns() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.subject || !body.body_html) {
    return NextResponse.json({ error: "Nombre, asunto y cuerpo requeridos" }, { status: 400 });
  }
  const campaign = insertCampaign({
    name: body.name,
    subject: body.subject,
    body_html: body.body_html,
    target_stage: body.target_stage ?? null,
    status: "draft",
  });
  return NextResponse.json({ campaign }, { status: 201 });
}
