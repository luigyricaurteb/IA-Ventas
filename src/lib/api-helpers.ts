import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken, AuthUser } from "./auth";
import { getCompanyDb } from "./master/db-company";
import type Database from "better-sqlite3";

export interface AuthCtx {
  me: AuthUser;
  db: Database.Database;
  company: string;
}

export function getAuthCtx(req: NextRequest): AuthCtx | null {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me) return null;
  const company = (me.company as string) ?? "platform";
  const db = getCompanyDb(company);
  return { me, db, company };
}

export function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
}
