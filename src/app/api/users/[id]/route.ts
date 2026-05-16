import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { hashPassword, getUserFromToken } from "@/lib/auth";

interface Ctx { params: Promise<{ id: string }> }

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || (!me.is_admin && me.role !== "master")) return null;
  return me;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const me = requireAdmin(req);
  if (!me) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  const db = getCompanyDb(me.company ?? "platform");

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined)        { fields.push("name=?");        values.push(body.name); }
  if (body.permissions !== undefined) { fields.push("permissions=?"); values.push(JSON.stringify(body.permissions)); }
  if (body.is_admin !== undefined)    { fields.push("is_admin=?");    values.push(body.is_admin ? 1 : 0); }
  if (body.active !== undefined)      { fields.push("active=?");      values.push(body.active ? 1 : 0); }
  if (body.password) {
    const { hash, salt } = hashPassword(body.password as string);
    fields.push("password_hash=?"); values.push(hash);
    fields.push("salt=?");          values.push(salt);
  }

  if (fields.length === 0) return NextResponse.json({ ok: true });
  values.push(Number(id));
  db.prepare(`UPDATE users SET ${fields.join(",")} WHERE id=?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const me = requireAdmin(req);
  if (!me) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { id } = await params;
  if (id === me.sub) return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });

  const db = getCompanyDb(me.company ?? "platform");
  db.prepare("DELETE FROM users WHERE id=? AND is_admin=0").run(Number(id));
  return NextResponse.json({ ok: true });
}
