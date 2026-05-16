import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
interface Ctx { params: Promise<{ conversationId: string }> }

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";

export async function GET(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const id = Number(conversationId);
  const db = getCompanyDb(me.company ?? "platform");

  const messages = db.prepare(
    "SELECT role, content FROM messages WHERE conversation_id=? AND role IN ('user','assistant','human') ORDER BY created_at ASC LIMIT 60"
  ).all(id) as { role: string; content: string }[];

  if (messages.length === 0) return NextResponse.json({ summary: "Sin mensajes para resumir." });

  const transcript = messages.map(m => {
    const who = m.role === "user" ? "Cliente" : "Agente";
    return `${who}: ${m.content}`;
  }).join("\n");

  if (!OPENROUTER_KEY) {
    return NextResponse.json({ summary: "⚠️ Configura OPENROUTER_API_KEY para usar esta función." });
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENROUTER_KEY}` },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [
          {
            role: "system",
            content: "Eres un asistente que resume conversaciones de servicio al cliente en español de forma concisa. Máximo 5 puntos clave.",
          },
          {
            role: "user",
            content: `Resume esta conversación en puntos clave (qué quiere el cliente, qué se acordó, próximos pasos):\n\n${transcript}`,
          },
        ],
        max_tokens: 400,
      }),
    });

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const summary = data.choices?.[0]?.message?.content ?? "No se pudo generar el resumen.";
    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "Error al conectar con la IA. Intenta de nuevo." }, { status: 502 });
  }
}
