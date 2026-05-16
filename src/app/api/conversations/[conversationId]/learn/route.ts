export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";
import OpenAI from "openai";

interface Ctx { params: Promise<{ conversationId: string }> }

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const id = Number(conversationId);
  const db = getCompanyDb(me.company ?? "platform");

  const messages = db.prepare(
    "SELECT role, content FROM messages WHERE conversation_id=? AND role IN ('user','assistant','human') ORDER BY created_at ASC LIMIT 60"
  ).all(id) as { role: string; content: string }[];

  if (messages.length < 3) {
    return NextResponse.json({ error: "La conversación tiene muy pocos mensajes para extraer aprendizajes" }, { status: 400 });
  }

  const transcript = messages.map(m =>
    `${m.role === "user" ? "CLIENTE" : "JULIETA"}: ${m.content}`
  ).join("\n");

  const cfg = db.prepare("SELECT ai_name, name FROM company_config WHERE id=1").get() as { ai_name: string | null; name: string | null } | null;
  const aiName = cfg?.ai_name ?? "Julieta";
  const companyName = cfg?.name ?? "la empresa";

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "Configura OPENROUTER_API_KEY para usar esta función" }, { status: 400 });
  }

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres un asistente que analiza conversaciones de ventas de ${companyName} y extrae conocimientos valiosos para que ${aiName} pueda mejorar futuras respuestas. Devuelve SOLO un JSON válido con esta estructura:
{
  "learnings": [
    { "topic": "Nombre corto del tema", "content": "Conocimiento concreto y útil" }
  ]
}
Extrae entre 1 y 5 aprendizajes. Enfócate en: preguntas frecuentes del cliente, objeciones y cómo se manejaron, información de productos/servicios mencionada, preferencias del cliente.`
        },
        {
          role: "user",
          content: `Analiza esta conversación y extrae aprendizajes útiles para ${aiName}:\n\n${transcript}`
        }
      ],
      max_tokens: 800,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
    // Extraer JSON aunque haya texto extra
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "No se pudo parsear la respuesta de la IA" }, { status: 502 });

    const parsed = JSON.parse(jsonMatch[0]) as { learnings: { topic: string; content: string }[] };
    const saved: { id: number; topic: string; content: string }[] = [];

    for (const l of (parsed.learnings ?? [])) {
      if (!l.topic || !l.content) continue;
      const row = db.prepare("INSERT INTO ai_learnings (topic, content) VALUES (?,?) RETURNING *")
        .get(l.topic.trim(), l.content.trim()) as { id: number; topic: string; content: string };
      saved.push(row);
    }

    return NextResponse.json({ saved, count: saved.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
