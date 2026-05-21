export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getCompanyDb } from "@/lib/master/db-company";
import masterDb from "@/lib/master/db-master";

interface Ctx { params: Promise<{ id: string }> }
const requireMaster = (req: NextRequest) => getUserFromToken(req.cookies.get("session_token")?.value ?? "")?.role === "master";

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const company = masterDb.prepare("SELECT slug FROM companies WHERE id=?").get(Number(id)) as { slug: string } | null;
  if (!company) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const db = getCompanyDb(company.slug);
  const cfg = db.prepare("SELECT audio_transcription_enabled FROM company_config WHERE id=1").get() as { audio_transcription_enabled: number } | null;
  return NextResponse.json({ audio_transcription_enabled: (cfg?.audio_transcription_enabled ?? 0) === 1 });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { id } = await params;
  const company = masterDb.prepare("SELECT slug FROM companies WHERE id=?").get(Number(id)) as { slug: string } | null;
  if (!company) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const body = await req.json() as { audio_transcription_enabled: boolean };
  const db = getCompanyDb(company.slug);
  db.prepare("UPDATE company_config SET audio_transcription_enabled=? WHERE id=1").run(body.audio_transcription_enabled ? 1 : 0);
  return NextResponse.json({ ok: true });
}
