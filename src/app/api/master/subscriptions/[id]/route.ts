import { NextRequest, NextResponse } from "next/server";
import { approveSubscription } from "@/lib/master/db-master";
import { getUserFromToken } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (auth?.role !== "master") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  approveSubscription(Number(id));
  return NextResponse.json({ ok: true });
}
