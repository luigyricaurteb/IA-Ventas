import { NextRequest, NextResponse } from "next/server";
import { listCompanies, createCompany } from "@/lib/master/db-master";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function requireMaster(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const auth  = getUserFromToken(token);
  return auth?.role === "master";
}

export async function GET(req: NextRequest) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  return NextResponse.json({ companies: listCompanies() });
}

export async function POST(req: NextRequest) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const body = await req.json();
  if (!body.name || !body.slug) return NextResponse.json({ error: "Nombre y slug requeridos" }, { status: 400 });
  // Slug solo alfanumérico con guiones
  const slug = String(body.slug).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50);
  if (!slug) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  try {
    const company = createCompany({ slug, name: body.name, email: body.email, phone: body.phone, plan_id: body.plan_id });
    return NextResponse.json({ company }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error al crear empresa";
    return NextResponse.json({ error: msg.includes("UNIQUE") ? "El slug ya existe" : msg }, { status: 400 });
  }
}
