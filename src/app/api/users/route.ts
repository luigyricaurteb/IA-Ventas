import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { hashPassword, getUserFromToken, sanitizeInput } from "@/lib/auth";

export const dynamic = "force-dynamic";

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || (!me.is_admin && me.role !== "master")) return null;
  return me;
}

export async function GET(req: NextRequest) {
  const me = requireAdmin(req);
  if (!me) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const db = getCompanyDb(me.company ?? "platform");
  const users = db.prepare(
    "SELECT id, username, name, permissions, is_admin, active, created_at FROM users ORDER BY is_admin DESC, name ASC"
  ).all();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const me = requireAdmin(req);
  if (!me) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const body = await req.json() as { username?: string; name?: string; password?: string; permissions?: Record<string, boolean>; is_admin?: boolean };
  const { username, name, password, permissions = {}, is_admin = false } = body;

  if (!username || !name || !password) {
    return NextResponse.json({ error: "Usuario, nombre y contraseña requeridos" }, { status: 400 });
  }

  const db = getCompanyDb(me.company ?? "platform");
  const existing = db.prepare("SELECT id FROM users WHERE username=?").get(sanitizeInput(username));
  if (existing) return NextResponse.json({ error: "El nombre de usuario ya existe" }, { status: 409 });

  const { hash, salt } = hashPassword(password);
  const user = db.prepare(
    "INSERT INTO users (username, name, password_hash, salt, permissions, is_admin) VALUES (?,?,?,?,?,?) RETURNING id, username, name, permissions, is_admin, active"
  ).get(sanitizeInput(username), name, hash, salt, JSON.stringify(permissions), is_admin ? 1 : 0);

  return NextResponse.json({ user }, { status: 201 });
}
