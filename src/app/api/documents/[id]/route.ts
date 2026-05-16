export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const body = await req.json();

  const allowed = ["type","title","content","version","active"];
  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ ok: true });

  const sets = fields.map((f) => `${f} = ?`).join(", ");
  db.prepare(`UPDATE legal_documents SET ${sets} WHERE id = ?`).run(
    ...fields.map((f) => body[f]),
    Number(id),
  );

  return NextResponse.json({ ok: true });
}
