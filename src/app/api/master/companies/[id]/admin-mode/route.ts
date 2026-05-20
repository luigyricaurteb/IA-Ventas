export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getCompanyDb } from "@/lib/master/db-company";
import masterDb from "@/lib/master/db-master";

interface Ctx { params: Promise<{ id: string }> }

function requireMaster(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  return getUserFromToken(token)?.role === "master";
}

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;

  const company = masterDb.prepare("SELECT slug FROM companies WHERE id=?").get(Number(id)) as { slug: string } | null;
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const db = getCompanyDb(company.slug);
  const cfg = db.prepare("SELECT admin_wa_phone, admin_wa_keyword, admin_mode_enabled FROM company_config WHERE id=1").get() as {
    admin_wa_phone: string | null; admin_wa_keyword: string | null; admin_mode_enabled: number;
  } | null;

  return NextResponse.json({
    admin_wa_phone: cfg?.admin_wa_phone ?? "",
    admin_wa_keyword: cfg?.admin_wa_keyword ?? "admin",
    admin_mode_enabled: (cfg?.admin_mode_enabled ?? 0) === 1,
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;

  const company = masterDb.prepare("SELECT slug FROM companies WHERE id=?").get(Number(id)) as { slug: string } | null;
  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const body = await req.json() as { admin_wa_phone?: string; admin_wa_keyword?: string; admin_mode_enabled?: boolean };
  const db = getCompanyDb(company.slug);

  if (body.admin_wa_phone !== undefined) db.prepare("UPDATE company_config SET admin_wa_phone=? WHERE id=1").run(body.admin_wa_phone || null);
  if (body.admin_wa_keyword !== undefined) db.prepare("UPDATE company_config SET admin_wa_keyword=? WHERE id=1").run(body.admin_wa_keyword || "admin");
  if (body.admin_mode_enabled !== undefined) db.prepare("UPDATE company_config SET admin_mode_enabled=? WHERE id=1").run(body.admin_mode_enabled ? 1 : 0);

  return NextResponse.json({ ok: true });
}
