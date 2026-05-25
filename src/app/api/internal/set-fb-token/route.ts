export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";

const SECRET = "hivo-fb-setup-2026-x9k";

export async function POST(req: NextRequest) {
  const { secret, slug, fb_page_token, fb_page_id, ig_account_id } =
    await req.json() as { secret: string; slug: string; fb_page_token: string; fb_page_id?: string; ig_account_id?: string };

  if (secret !== SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = getCompanyDb(slug);

  const fields: string[] = ["fb_page_token=?"];
  const values: unknown[] = [fb_page_token];

  if (fb_page_id) { fields.push("fb_page_id=?"); values.push(fb_page_id); }
  if (ig_account_id) { fields.push("ig_account_id=?"); values.push(ig_account_id); }

  db.prepare(`UPDATE whatsapp_config SET ${fields.join(", ")} WHERE id=1`).run(...values);

  return NextResponse.json({ ok: true, updated: fields });
}
