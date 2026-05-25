export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";

// Endpoint temporal de un solo uso — se elimina después del deploy
const SECRET = "hivo-fb-setup-2026-x9k";

export async function POST(req: NextRequest) {
  const body = await req.json() as { secret?: string; company?: string; fb_page_id?: string; fb_page_token?: string; ig_account_id?: string };
  if (body.secret !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const slug = body.company ?? "platform";
  const db = getCompanyDb(slug);

  db.prepare("UPDATE whatsapp_config SET fb_page_id=?, fb_page_token=?, ig_account_id=? WHERE id=1")
    .run(body.fb_page_id ?? null, body.fb_page_token ?? null, body.ig_account_id ?? null);

  const cfg = db.prepare("SELECT fb_page_id, ig_account_id FROM whatsapp_config WHERE id=1").get();
  return NextResponse.json({ ok: true, config: cfg });
}
