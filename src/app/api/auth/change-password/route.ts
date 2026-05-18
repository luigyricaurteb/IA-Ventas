export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db, me } = ctx;

  const { current_password, new_password } = await req.json() as {
    current_password?: string;
    new_password?: string;
  };

  if (!new_password || new_password.length < 6) {
    return NextResponse.json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  // Verificar contraseña actual
  const user = db.prepare("SELECT password_hash, salt FROM users WHERE id=?").get(Number(me.sub)) as
    { password_hash: string; salt: string } | null;

  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (current_password) {
    const valid = verifyPassword(current_password, user.password_hash, user.salt);
    if (!valid) return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 400 });
  }

  const { hash, salt } = hashPassword(new_password);
  db.prepare("UPDATE users SET password_hash=?, salt=? WHERE id=?").run(hash, salt, Number(me.sub));

  return NextResponse.json({ ok: true });
}
