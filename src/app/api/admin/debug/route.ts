export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { listCompanies } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";

// Endpoint de diagnóstico — solo GET, sin auth para poder debuggear
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "status";

  if (action === "status") {
    const companies = listCompanies();
    const result = companies.map(c => {
      try {
        const db = getCompanyDb(c.slug);
        const waCfg = db.prepare("SELECT provider, wa_phone_number_id, wa_phone_display, fb_page_id, ig_account_id FROM whatsapp_config WHERE id=1").get() as Record<string, string | null> | null;
        return { slug: c.slug, name: c.name, status: c.status, wa: waCfg };
      } catch (e) {
        return { slug: c.slug, name: c.name, status: c.status, error: (e as Error).message };
      }
    });
    return NextResponse.json({ companies: result });
  }

  // Forzar guardado directo del phone_number_id en una empresa
  if (action === "fix") {
    const slug = searchParams.get("slug") ?? "platform";
    const phoneId = searchParams.get("phone_id");
    const token = searchParams.get("token");
    if (!phoneId) return NextResponse.json({ error: "phone_id requerido" }, { status: 400 });
    try {
      const db = getCompanyDb(slug);
      db.prepare("UPDATE whatsapp_config SET provider='meta', wa_phone_number_id=?, wa_access_token=COALESCE(?,wa_access_token), updated_at=unixepoch() WHERE id=1")
        .run(phoneId, token ?? null);
      db.prepare("UPDATE connection_state SET status='connected', phone=?, updated_at=unixepoch() WHERE id=1").run(phoneId);
      const updated = db.prepare("SELECT wa_phone_number_id, provider FROM whatsapp_config WHERE id=1").get();
      return NextResponse.json({ ok: true, updated });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "action desconocida" }, { status: 400 });
}
