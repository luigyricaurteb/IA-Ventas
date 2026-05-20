export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://hivo.app", "X-Title": "Hivo Autopilot" },
});
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

const TONE_MAP: Record<string, string> = {
  profesional: "Profesional, elegante y confiable. Transmite autoridad y calidad.",
  casual: "Cercano, amigable y conversacional. Como si hablara un amigo.",
  entretenido: "Divertido, con energía y emojis. Que genere emoción y engagement.",
  informativo: "Educativo y claro. Enfocado en los beneficios y detalles del servicio.",
};

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const body = await req.json() as { imageId?: number; customPrompt?: string };

  const cfg = db.prepare("SELECT * FROM autopilot_config WHERE id=1").get() as { tone: string } | null;
  const company = db.prepare("SELECT name, ai_general_instructions FROM company_config WHERE id=1").get() as { name: string | null; ai_general_instructions: string | null } | null;
  const products = db.prepare("SELECT name, price_per_person, description FROM products WHERE active=1").all() as { name: string; price_per_person: number; description: string | null }[];

  const tone = TONE_MAP[cfg?.tone ?? "profesional"];
  const companyName = company?.name ?? "nuestra empresa";
  const instructions = company?.ai_general_instructions ?? "";
  const productList = products.map(p => `• ${p.name}: $${p.price_per_person.toLocaleString("es-CO")}/persona${p.description ? ` — ${p.description}` : ""}`).join("\n");

  const prompt = body.customPrompt
    ? `Genera un post para redes sociales de ${companyName}. Instrucción del usuario: "${body.customPrompt}". Tono: ${tone}`
    : `Genera un post creativo para redes sociales de ${companyName}.

SOBRE LA EMPRESA:
${instructions || `Empresa colombiana con servicios de calidad.`}

SERVICIOS/PRODUCTOS:
${productList || "Ver nuestro catálogo"}

TONO: ${tone}

INSTRUCCIONES:
- Escribe una publicación atractiva para Instagram/Facebook (máx 150 palabras)
- El texto debe incitar a contactar por WhatsApp o hacer una reserva
- Agrega 5-8 hashtags relevantes al final separados con espacio
- Responde SOLO con el texto del post y los hashtags, nada más`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 400,
    });

    const full = completion.choices[0]?.message?.content?.trim() ?? "";

    // Separar caption de hashtags
    const hashtagMatch = full.match(/(#\w[\wÀ-ž]*\s*)+$/m);
    const hashtags = hashtagMatch ? hashtagMatch[0].trim() : "";
    const caption = hashtags ? full.replace(hashtags, "").trim() : full;

    return NextResponse.json({ caption, hashtags, full });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
