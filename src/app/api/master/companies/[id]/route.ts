export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCompanyById, updateCompany } from "@/lib/master/db-master";
import masterDb from "@/lib/master/db-master";
import { getUserFromToken } from "@/lib/auth";
import { clearCompanyDbCache } from "@/lib/master/db-company";
import fs from "node:fs";
import path from "node:path";

interface Ctx { params: Promise<{ id: string }> }

function requireMaster(req: NextRequest) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  return auth?.role === "master";
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const company = masterDb.prepare("SELECT * FROM companies WHERE id=?").get(Number(id));
  if (!company) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ company });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  // Filtrar solo campos válidos
  const allowed = ["name","email","phone","plan_id","status","logo_filename","cost_model"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (body[k] !== undefined) update[k] = body[k]; }
  if (Object.keys(update).length) {
    // cost_model se guarda directo en master DB
    if (update.cost_model !== undefined) {
      masterDb.prepare("UPDATE companies SET cost_model=?, updated_at=unixepoch() WHERE id=?").run(update.cost_model, Number(id));
      delete update.cost_model;
    }
    if (Object.keys(update).length) updateCompany(Number(id), update);
  }
  const company = masterDb.prepare("SELECT * FROM companies WHERE id=?").get(Number(id));
  return NextResponse.json({ ok: true, company });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const company = getCompanyById(Number(id));
  if (!company) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (company.slug === "platform") return NextResponse.json({ error: "No se puede eliminar la empresa plataforma" }, { status: 400 });

  // Limpiar cache de conexión DB
  clearCompanyDbCache(company.slug);

  // Eliminar archivos de la empresa
  try { if (company.db_path && fs.existsSync(company.db_path)) fs.unlinkSync(company.db_path); } catch {}
  try { if (company.auth_path && fs.existsSync(company.auth_path)) fs.rmSync(company.auth_path, { recursive: true, force: true }); } catch {}

  // Eliminar de la DB maestra (cascada: subscriptions, etc.)
  masterDb.prepare("DELETE FROM subscriptions WHERE company_id=?").run(Number(id));
  masterDb.prepare("DELETE FROM companies WHERE id=?").run(Number(id));

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
