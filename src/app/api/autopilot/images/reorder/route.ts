export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as { ids: number[] };
  const stmt = db.prepare("UPDATE autopilot_images SET order_index=? WHERE id=?");
  body.ids.forEach((id, index) => stmt.run(index, id));
  return NextResponse.json({ ok: true });
}
