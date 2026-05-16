import { NextRequest, NextResponse } from "next/server";
import { updateUser, deleteUser } from "@/lib/db";
import { hashPassword, getUserFromToken } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.name)   update.name = body.name;
  if (body.role)   update.role = body.role;
  if (body.active !== undefined) update.active = body.active ? 1 : 0;
  if (body.password) {
    const { hash, salt } = hashPassword(body.password);
    update.password_hash = hash; update.salt = salt;
  }
  updateUser(Number(id), update as Parameters<typeof updateUser>[1]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  if (Number(id) === me.id) return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
  deleteUser(Number(id));
  return NextResponse.json({ ok: true });
}
