import { NextRequest, NextResponse } from "next/server";
import { listUsers, insertUser, getUserByUsername } from "@/lib/db";
import { hashPassword, getUserFromToken } from "@/lib/auth";
import type { UserRole } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  return NextResponse.json({ users: listUsers() });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const body = await req.json();
  if (!body.username || !body.password || !body.name) {
    return NextResponse.json({ error: "Username, contraseña y nombre requeridos" }, { status: 400 });
  }

  if (getUserByUsername(body.username)) {
    return NextResponse.json({ error: "El nombre de usuario ya existe" }, { status: 409 });
  }

  const { hash, salt } = hashPassword(body.password);
  const user = insertUser({
    username: body.username, name: body.name,
    password_hash: hash, salt,
    role: (body.role ?? "ventas") as UserRole,
  });
  return NextResponse.json({ user }, { status: 201 });
}
