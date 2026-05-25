/**
 * Autopilot Fase 2 — Publicación automática
 * Este endpoint es llamado por el cron interno del bot process cada hora.
 * Revisa todas las empresas con autopilot activo y publica si corresponde.
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getCompanyDb } from "@/lib/master/db-company";
import masterDb, { listCompanies } from "@/lib/master/db-master";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://hivo.app", "X-Title": "Hivo Autopilot" },
});
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
const BASE = "https://graph.facebook.com/v21.0";

// Frecuencia → segundos entre posts
const FREQ_SECS: Record<string, number> = {
  daily:  86400,
  "5week": 86400 * 7 / 5,
  "3week": 86400 * 7 / 3,
  weekly: 86400 * 7,
};

const TONES: Record<string, string> = {
  profesional: "Profesional y elegante.",
  casual: "Cercano y amigable.",
  entretenido: "Divertido con energía.",
  informativo: "Educativo y claro.",
};

async function generateCaption(db: import("better-sqlite3").Database, tone: string): Promise<{ caption: string; hashtags: string }> {
  const company = db.prepare("SELECT name, ai_general_instructions FROM company_config WHERE id=1").get() as { name: string | null; ai_general_instructions: string | null } | null;
  const products = db.prepare("SELECT name, price_per_person FROM products WHERE active=1").all() as { name: string; price_per_person: number }[];
  const productList = products.map(p => `• ${p.name}: $${p.price_per_person.toLocaleString("es-CO")}/persona`).join("\n");

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content:
      `Genera un post creativo para redes sociales de ${company?.name ?? "la empresa"}.\n${company?.ai_general_instructions ?? ""}\nServicios:\n${productList}\nTono: ${TONES[tone] ?? "Profesional"}\nMáx 120 palabras. Agrega 5 hashtags al final.`
    }],
    temperature: 0.8, max_tokens: 300,
  });

  const full = completion.choices[0]?.message?.content?.trim() ?? "";
  const hashtagMatch = full.match(/(#\w[\wÀ-ž]*\s*)+$/m);
  const hashtags = hashtagMatch ? hashtagMatch[0].trim() : "";
  const caption = hashtags ? full.replace(hashtags, "").trim() : full;
  return { caption, hashtags };
}

async function publishPost(db: import("better-sqlite3").Database, slug: string) {
  const cfg = db.prepare("SELECT * FROM autopilot_config WHERE id=1").get() as {
    tone: string; publish_facebook: number; publish_instagram: number; auto_approve: number;
  } | null;

  const waCfg = db.prepare("SELECT fb_page_id, fb_page_token, ig_account_id FROM whatsapp_config WHERE id=1").get() as {
    fb_page_id: string | null; fb_page_token: string | null; ig_account_id: string | null;
  } | null;

  // Pick next image in rotation
  const lastPost = db.prepare("SELECT image_id FROM autopilot_posts WHERE status='published' ORDER BY published_at DESC LIMIT 1").get() as { image_id: number | null } | null;
  const images = db.prepare("SELECT * FROM autopilot_images WHERE active=1 ORDER BY order_index ASC").all() as { id: number; filename: string }[];
  if (!images.length) { console.log(`[autopilot:${slug}] Sin imágenes en el banco`); return; }

  let nextImage = images[0];
  if (lastPost?.image_id) {
    const lastIdx = images.findIndex(i => i.id === lastPost.image_id);
    if (lastIdx >= 0 && lastIdx < images.length - 1) nextImage = images[lastIdx + 1];
  }

  const { caption, hashtags } = await generateCaption(db, cfg?.tone ?? "profesional");
  const message = [caption, hashtags].filter(Boolean).join("\n\n");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `https://aivoxgroup.com`);
  const imageUrl = `${appUrl}/api/uploads/autopilot/${nextImage.filename}`;

  let fbPostId: string | null = null;
  let igPostId: string | null = null;
  const errors: string[] = [];

  // Facebook
  if ((cfg?.publish_facebook ?? 1) && waCfg?.fb_page_id && waCfg?.fb_page_token) {
    try {
      const r = await fetch(`${BASE}/${waCfg.fb_page_id}/photos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl, message, access_token: waCfg.fb_page_token }),
        signal: AbortSignal.timeout(30000),
      });
      const d = await r.json() as { id?: string; error?: { message: string } };
      if (d.id) fbPostId = d.id; else errors.push(`FB: ${d.error?.message ?? "error"}`);
    } catch (e) { errors.push(`FB: ${(e as Error).message}`); }
  }

  // Instagram
  if ((cfg?.publish_instagram ?? 1) && waCfg?.ig_account_id && waCfg?.fb_page_token) {
    try {
      const cr = await fetch(`${BASE}/${waCfg.ig_account_id}/media`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, caption: message, access_token: waCfg.fb_page_token }),
        signal: AbortSignal.timeout(30000),
      });
      const cd = await cr.json() as { id?: string; error?: { message: string } };
      if (cd.id) {
        await new Promise(r => setTimeout(r, 3000));
        const pr = await fetch(`${BASE}/${waCfg.ig_account_id}/media_publish`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: cd.id, access_token: waCfg.fb_page_token }),
          signal: AbortSignal.timeout(30000),
        });
        const pd = await pr.json() as { id?: string; error?: { message: string } };
        if (pd.id) igPostId = pd.id; else errors.push(`IG: ${pd.error?.message ?? "error"}`);
      } else errors.push(`IG: ${cd.error?.message ?? "error"}`);
    } catch (e) { errors.push(`IG: ${(e as Error).message}`); }
  }

  const success = !!(fbPostId || igPostId);
  const now = Math.floor(Date.now() / 1000);
  const freqSecs = FREQ_SECS[db.prepare("SELECT frequency FROM autopilot_config WHERE id=1").get() ? (db.prepare("SELECT frequency FROM autopilot_config WHERE id=1").get() as { frequency: string }).frequency : "3week"] ?? FREQ_SECS["3week"];

  db.prepare(`
    INSERT INTO autopilot_posts (image_id, caption, hashtags, platform, status, published_at, fb_post_id, ig_post_id, error_msg)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(nextImage.id, caption, hashtags, "both", success ? "published" : "failed", success ? now : null, fbPostId, igPostId, errors.join(" | ") || null);

  db.prepare("UPDATE company_config SET autopilot_next_post_at=? WHERE id=1").run(now + freqSecs);
  console.log(`[autopilot:${slug}] ${success ? "✅ Publicado" : "❌ Error"} FB:${fbPostId} IG:${igPostId}`);
}

export async function POST(req: NextRequest) {
  // Called internally by bot scheduler OR manually from UI
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  const internalKey = req.headers.get("x-internal-key");
  const isInternal = internalKey === (process.env.INTERNAL_SCHEDULER_KEY ?? "hivo-scheduler-2026");

  if (!me && !isInternal) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { slug?: string; force?: boolean };
  const now = Math.floor(Date.now() / 1000);
  const results: { slug: string; published: boolean; reason: string }[] = [];

  const slugsToCheck = body.slug
    ? [body.slug]
    : listCompanies().filter(c => c.status === "active").map(c => c.slug);

  for (const slug of slugsToCheck) {
    try {
      const db = getCompanyDb(slug);
      const cfg = db.prepare("SELECT autopilot_enabled, autopilot_next_post_at FROM company_config WHERE id=1").get() as {
        autopilot_enabled: number; autopilot_next_post_at: number | null;
      } | null;
      const autoCfg = db.prepare("SELECT enabled FROM autopilot_config WHERE id=1").get() as { enabled: number } | null;

      if (!cfg?.autopilot_enabled || !autoCfg?.enabled) { results.push({ slug, published: false, reason: "disabled" }); continue; }
      if (!body.force && cfg.autopilot_next_post_at && cfg.autopilot_next_post_at > now) {
        results.push({ slug, published: false, reason: `next at ${new Date(cfg.autopilot_next_post_at * 1000).toLocaleString()}` }); continue;
      }

      await publishPost(db, slug);
      results.push({ slug, published: true, reason: "ok" });
    } catch (e) {
      results.push({ slug, published: false, reason: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, results });
}
