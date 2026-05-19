export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";

interface ResetToken {
  id: number; token: string; user_type: string;
  company_slug: string | null; username: string;
  expires_at: number; used: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { token: string; password: string };
  const { token, password } = body;

  if (!token || !password || password.length < 6) {
    return NextResponse.json({ error: "Contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const row = masterDb.prepare(
    "SELECT * FROM password_reset_tokens WHERE token=? AND used=0 AND expires_at > unixepoch()"
  ).get(token) as ResetToken | null;

  if (!row) return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 400 });

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");

  if (row.user_type === "master") {
    masterDb.prepare("UPDATE master_users SET password_hash=?, salt=? WHERE username=?").run(hash, salt, row.username);
  } else {
    try {
      const db = getCompanyDb(row.company_slug!);
      db.prepare("UPDATE users SET password_hash=?, salt=? WHERE username=?").run(hash, salt, row.username);
    } catch {
      return NextResponse.json({ error: "Error actualizando contraseña" }, { status: 500 });
    }
  }

  masterDb.prepare("UPDATE password_reset_tokens SET used=1 WHERE id=?").run(row.id);
  return NextResponse.json({ ok: true });
}
