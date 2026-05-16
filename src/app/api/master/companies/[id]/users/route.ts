export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCompanyById } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken, hashPassword, sanitizeInput } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

function requireMaster(req: NextRequest) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  return auth?.role === "master" ? auth : null;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const company = getCompanyById(Number(id));
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  const db = getCompanyDb(company.slug);
  const users = db.prepare(
    "SELECT id, username, name, permissions, is_admin, active, created_at FROM users ORDER BY is_admin DESC, name ASC"
  ).all();
  return NextResponse.json({ users, slug: company.slug });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const company = getCompanyById(Number(id));
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  const body = await req.json() as { username?: string; name?: string; password?: string; permissions?: Record<string,boolean>; is_admin?: boolean };
  const { username, name, password, permissions = {}, is_admin = false } = body;
  if (!username || !name || !password) return NextResponse.json({ error: "Usuario, nombre y contraseña requeridos" }, { status: 400 });
  const db = getCompanyDb(company.slug);
  const existing = db.prepare("SELECT id FROM users WHERE username=?").get(sanitizeInput(username));
  if (existing) return NextResponse.json({ error: "El nombre de usuario ya existe" }, { status: 409 });
  const { hash, salt } = hashPassword(password);
  const user = db.prepare(
    "INSERT INTO users (username, name, password_hash, salt, permissions, is_admin) VALUES (?,?,?,?,?,?) RETURNING id, username, name, permissions, is_admin, active"
  ).get(sanitizeInput(username), name, hash, salt, JSON.stringify(permissions), is_admin ? 1 : 0);
  return NextResponse.json({ user }, { status: 201 });
}
