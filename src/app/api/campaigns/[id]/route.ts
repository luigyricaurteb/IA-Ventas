export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(Number(id));
  if (!campaign) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const body = await req.json();

  const allowed = ["name","subject","body_html","target_stage","status","recipients_count","sent_at"];
  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  const sets = fields.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE campaigns SET ${sets} WHERE id = ?`).run(
    ...fields.map((f) => body[f]),
    Number(id),
  );

  return NextResponse.json({ ok: true });
}
