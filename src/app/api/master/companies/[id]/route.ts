import { NextRequest, NextResponse } from "next/server";
import { getCompanyById, updateCompany } from "@/lib/master/db-master";
import { getUserFromToken } from "@/lib/auth";
import fs from "node:fs";
import path from "node:path";

interface Ctx { params: Promise<{ id: string }> }

function requireMaster(req: NextRequest) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  return auth?.role === "master";
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  updateCompany(Number(id), body);
  return NextResponse.json({ ok: true });
}

// Subir logo de empresa
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("logo") as File | null;
  if (!file) return NextResponse.json({ error: "No se envió logo" }, { status: 400 });
  const bytes = await file.arrayBuffer();
  const ext = file.name.split(".").pop() ?? "png";
  const filename = `company_${id}_logo_${Date.now()}.${ext}`;
  const dir = path.resolve(process.cwd(), "public", "uploads", "master");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), Buffer.from(bytes));
  updateCompany(Number(id), { logo_filename: filename });
  return NextResponse.json({ filename });
}
