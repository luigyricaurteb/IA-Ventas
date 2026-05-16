export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
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

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

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
        const existingContact = db.prepare(
          "SELECT id FROM contacts WHERE conversation_id = ?"
        ).get(conv.id) as { id: number } | null;

        if (existingContact) {
          const sets = Object.keys(contactData).map((k) => `${k} = ?`).join(", ");
          db.prepare(`UPDATE contacts SET ${sets}, updated_at = unixepoch() WHERE id = ?`)
            .run(...Object.values(contactData), existingContact.id);
        } else {
          const cols = ["conversation_id", ...Object.keys(contactData)].join(", ");
          const placeholders = ["?", ...Object.keys(contactData).map(() => "?")].join(", ");
          db.prepare(`INSERT INTO contacts (${cols}) VALUES (${placeholders})`)
            .run(conv.id, ...Object.values(contactData));
        }
      }

      // Actualizar nombre de conversación
      if (extracted.full_name && !conv.name) {
        db.prepare("UPDATE conversations SET name = ? WHERE id = ?").run(extracted.full_name, conv.id);
      }

      // Setear estado del bot
      const botState = extracted.bot_state ?? "BROWSING";
      const existing = db.prepare(
        "SELECT conversation_id FROM bot_conversation_state WHERE conversation_id = ?"
      ).get(conv.id);
      if (existing) {
        db.prepare(
          "UPDATE bot_conversation_state SET state = ?, data = ?, updated_at = unixepoch() WHERE conversation_id = ?"
        ).run(botState, JSON.stringify(contactData), conv.id);
      } else {
        db.prepare(
          "INSERT INTO bot_conversation_state (conversation_id, state, data) VALUES (?, ?, ?)"
        ).run(conv.id, botState, JSON.stringify(contactData));
      }

      // Crear/actualizar deal en CRM
      let deal = db.prepare<[number], { id: number; stage: string }>(
        "SELECT id, stage FROM crm_deals WHERE conversation_id = ? LIMIT 1"
      ).get(conv.id);

      if (!deal) {
        const contact = db.prepare<[number], { id: number }>(
          "SELECT id FROM contacts WHERE conversation_id = ? LIMIT 1"
        ).get(conv.id);
        deal = db.prepare<[number | null, number], { id: number; stage: string }>(
          "INSERT INTO crm_deals (contact_id, conversation_id) VALUES (?, ?) RETURNING id, stage"
        ).get(contact?.id ?? null, conv.id)!;
      }

      const validStages = ["NUEVO","CALIFICADO","PROPUESTA","NEGOCIACION","GANADO","PERDIDO"];
      if (deal && extracted.stage && validStages.includes(extracted.stage) && extracted.stage !== deal.stage) {
        db.prepare(
          "UPDATE crm_deals SET stage = ?, stage_changed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?"
        ).run(extracted.stage, deal.id);
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
