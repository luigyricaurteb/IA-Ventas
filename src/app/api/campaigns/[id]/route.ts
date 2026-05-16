import { NextRequest, NextResponse } from "next/server";
import { getCampaignById, updateCampaign } from "@/lib/db";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const campaign = getCampaignById(Number(id));
  if (!campaign) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  updateCampaign(Number(id), body);
  return NextResponse.json({ ok: true });
}
