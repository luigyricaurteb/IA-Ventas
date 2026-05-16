import { NextResponse } from "next/server";
import db, {
  getOrCreateConversation, upsertContact, setBotState,
  getOrCreateDeal, updateDealStage, insertMessage,
} from "@/lib/db";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "http://localhost:8080" },
});
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

interface ScanResult {
  conversation_id: number;
  phone: string;
  status: "skipped" | "scanned";
  extracted?: Record<string, string | null>;
  state?: string;
}

export async function POST() {
  // Conversaciones con mensajes pero sin estado de bot definido (o en INIT)
  const conversations = db.prepare<[], { id: number; phone: string; name: string | null }>(`
    SELECT c.id, c.phone, c.name
    FROM conversations c
    WHERE EXISTS (SELECT 1 FROM messages WHERE conversation_id = c.id)
      AND (
        NOT EXISTS (SELECT 1 FROM bot_conversation_state WHERE conversation_id = c.id)
        OR (SELECT state FROM bot_conversation_state WHERE conversation_id = c.id) = 'INIT'
      )
    ORDER BY c.last_message_at DESC
    LIMIT 50
  `).all();

  const results: ScanResult[] = [];

  for (const conv of conversations) {
    const messages = db.prepare<[number], { role: string; content: string }>(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 40"
    ).all(conv.id);

    if (messages.length === 0) {
      results.push({ conversation_id: conv.id, phone: conv.phone, status: "skipped" });
      continue;
    }

    // Construir historial para el análisis
    const history = messages
      .map((m) => `${m.role === "user" ? "CLIENTE" : "JULIETA"}: ${m.content}`)
      .join("\n");

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `Analiza esta conversación de WhatsApp entre un cliente y un bot de ventas.
Extrae la información disponible y devuelve SOLO un JSON con estos campos (null si no se menciona):
{
  "full_name": "nombre completo del cliente",
  "email": "correo electrónico",
  "interest": "qué servicio o producto le interesa",
  "budget": "presupuesto mencionado",
  "travel_date": "fecha de viaje o evento mencionada",
  "people_count": "número de personas (solo el número)",
  "stage": "una de: NUEVO, CALIFICADO, PROPUESTA, NEGOCIACION, GANADO, PERDIDO",
  "bot_state": "una de: COLLECTING_NAME, COLLECTING_EMAIL, COLLECTING_INTEREST, COLLECTING_BUDGET, COLLECTING_DATE, BROWSING, QUOTE_SENT, AWAITING_PAYMENT, DONE",
  "summary": "resumen de 1 línea del estado de la conversación"
}`
          },
          { role: "user", content: history }
        ],
        max_tokens: 400,
        temperature: 0,
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const extracted = JSON.parse(jsonMatch[0]) as {
        full_name?: string | null; email?: string | null; interest?: string | null;
        budget?: string | null; travel_date?: string | null; people_count?: string | null;
        stage?: string; bot_state?: string; summary?: string;
      };

      // Actualizar contacto
      const contactData: Record<string, string | number | null> = {};
      if (extracted.full_name)   contactData.full_name   = extracted.full_name;
      if (extracted.email)       contactData.email       = extracted.email;
      if (extracted.interest)    contactData.interest    = extracted.interest;
      if (extracted.budget)      contactData.budget      = extracted.budget;
      if (extracted.travel_date) contactData.travel_date = extracted.travel_date;
      if (extracted.people_count) contactData.people_count = parseInt(extracted.people_count) || null;

      if (Object.keys(contactData).length > 0) {
        upsertContact(conv.id, contactData);
      }

      // Actualizar nombre de conversación
      if (extracted.full_name && !conv.name) {
        db.prepare("UPDATE conversations SET name = ? WHERE id = ?").run(extracted.full_name, conv.id);
      }

      // Setear estado del bot
      const botState = (extracted.bot_state ?? "BROWSING") as Parameters<typeof setBotState>[1];
      setBotState(conv.id, botState, contactData as Record<string, unknown>);

      // Crear/actualizar deal en CRM
      const deal = getOrCreateDeal(conv.id);
      const validStages = ["NUEVO","CALIFICADO","PROPUESTA","NEGOCIACION","GANADO","PERDIDO"];
      if (extracted.stage && validStages.includes(extracted.stage)) {
        updateDealStage(deal.id, extracted.stage as Parameters<typeof updateDealStage>[1]);
      }

      results.push({
        conversation_id: conv.id,
        phone: conv.phone,
        status: "scanned",
        extracted: {
          name:    extracted.full_name ?? null,
          email:   extracted.email    ?? null,
          stage:   extracted.stage    ?? null,
          summary: extracted.summary  ?? null,
        },
        state: botState,
      });
    } catch (err) {
      console.error(`[scan] Error procesando conv ${conv.id}:`, err);
      results.push({ conversation_id: conv.id, phone: conv.phone, status: "skipped" });
    }

    // Pausa para no saturar el LLM
    await new Promise((r) => setTimeout(r, 300));
  }

  return NextResponse.json({
    total: conversations.length,
    scanned: results.filter((r) => r.status === "scanned").length,
    results,
  });
}
