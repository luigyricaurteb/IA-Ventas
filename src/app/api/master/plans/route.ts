import { NextRequest, NextResponse } from "next/server";
import { listPlans, upsertPlan } from "@/lib/master/db-master";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ plans: listPlans() });
}

export async function POST(req: NextRequest) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (auth?.role !== "master") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const plan = upsertPlan(body);
  return NextResponse.json({ plan }, { status: 201 });
}
