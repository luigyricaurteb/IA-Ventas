export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCompanyById } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken, hashPassword } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string; userId: string }> }

function requireMaster(req: NextRequest) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  return auth?.role === "master";
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id, userId } = await params;
  const company = getCompanyById(Number(id));
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  const db = getCompanyDb(company.slug);
  const body = await req.json() as Record<string, unknown>;
  const fields: string[] = []; const values: unknown[] = [];
  if (body.name !== undefined)        { fields.push("name=?");        values.push(body.name); }
  if (body.permissions !== undefined) { fields.push("permissions=?"); values.push(JSON.stringify(body.permissions)); }
  if (body.is_admin !== undefined)    { fields.push("is_admin=?");    values.push(body.is_admin ? 1 : 0); }
  if (body.active !== undefined)      { fields.push("active=?");      values.push(body.active ? 1 : 0); }
  if (body.password) {
    const { hash, salt } = hashPassword(body.password as string);
    fields.push("password_hash=?"); values.push(hash);
    fields.push("salt=?");          values.push(salt);
  }
  if (!fields.length) return NextResponse.json({ ok: true });
  values.push(Number(userId));
  db.prepare(`UPDATE users SET ${fields.join(",")} WHERE id=?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id, userId } = await params;
  const company = getCompanyById(Number(id));
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  const db = getCompanyDb(company.slug);
  // Proteger: no dejar la empresa sin al menos un admin
  const target = db.prepare("SELECT is_admin FROM users WHERE id=?").get(Number(userId)) as { is_admin: number } | null;
  if (target?.is_admin) {
    const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE is_admin=1 AND active=1").get() as { c: number }).c;
    if (adminCount <= 1) return NextResponse.json({ error: "Debe quedar al menos un administrador" }, { status: 400 });
  }
  db.prepare("DELETE FROM users WHERE id=?").run(Number(userId));
  return NextResponse.json({ ok: true });
}
