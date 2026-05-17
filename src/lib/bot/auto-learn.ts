import OpenAI from "openai";
import type Database from "better-sqlite3";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "http://localhost:8080", "X-Title": "Agente DMC Auto-Learn" },
});
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

// Extrae aprendizajes de la conversación cada N mensajes
export async function autoLearn(db: Database.Database, conversationId: number): Promise<void> {
  try {
    const msgCount = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id=?").get(conversationId) as { c: number }).c;
    // Solo aprender cada 6 mensajes y cuando hay suficiente contexto
    if (msgCount < 6 || msgCount % 6 !== 0) return;

    const msgs = db.prepare(
      "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 12"
    ).all(conversationId) as { role: string; content: string }[];
    if (msgs.length < 4) return;

    const history = msgs.reverse()
      .map(m => `${m.role === "user" ? "CLIENTE" : "JULIETA"}: ${m.content}`)
      .join("\n");

    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Eres un analista experto en ventas y atención al cliente. Analiza esta conversación y extrae máximo 2 aprendizajes concretos y accionables. 

Tipos de aprendizaje útiles:
- Objeciones frecuentes y cómo fueron manejadas
- Preguntas recurrentes sobre productos/servicios
- Información del negocio del cliente que Julieta debería recordar
- Patrones de conversación que funcionaron bien o mal
- Preferencias o comportamientos detectados

IMPORTANTE: Solo extrae algo si es genuinamente valioso y no obvio. Si no hay nada nuevo, retorna [].
Responde ÚNICAMENTE con JSON válido, sin explicaciones: [{"topic": "...", "content": "..."}] o []`,
        },
        { role: "user", content: `Conversación:\n${history}` },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;

    const learnings = JSON.parse(match[0]) as { topic: string; content: string }[];
    for (const l of learnings) {
      if (!l.topic?.trim() || !l.content?.trim()) continue;
      const topic = `[Auto] ${l.topic.trim()}`;
      const existing = db.prepare("SELECT id FROM ai_learnings WHERE topic=?").get(topic) as { id: number } | null;
      if (existing) {
        db.prepare("UPDATE ai_learnings SET content=?, created_at=unixepoch() WHERE id=?").run(l.content.trim(), existing.id);
      } else {
        db.prepare("INSERT INTO ai_learnings (topic, content, source) VALUES (?,?,'auto')").run(topic, l.content.trim());
      }
    }
  } catch (e) {
    console.error("[auto-learn]", (e as Error).message);
  }
}
