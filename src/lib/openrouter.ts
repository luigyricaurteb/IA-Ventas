import OpenAI from "openai";
import { getCompanyDb } from "./master/db-company";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:8080",
    "X-Title": "Agente WhatsApp DMC",
  },
});

const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

type HistoryMsg = { role: string; content: string };

function buildBaseSystemPrompt(slug: string): string {
  const db = getCompanyDb(slug);
  const config = db.prepare("SELECT * FROM company_config WHERE id=1").get() as { ai_name: string | null; name: string | null; ai_general_instructions: string | null } | null;
  const aiName = config?.ai_name ?? "Julieta";
  const company = config?.name ?? "nuestra empresa";
  const generalInstructions = config?.ai_general_instructions ?? "";

  const learnings = db.prepare("SELECT topic, content FROM ai_learnings ORDER BY created_at DESC LIMIT 30").all() as { topic: string; content: string }[];

  let prompt = `Eres ${aiName}, la asistente virtual de *${company}*.\n`;

  if (generalInstructions.trim()) {
    prompt += `\n${generalInstructions.trim()}\n`;
  } else {
    prompt += `Eres amable, profesional y eficiente. Responde en español neutro. Tus respuestas son breves (2-4 líneas máximo). No uses emojis en exceso.\n`;
  }

  if (learnings.length > 0) {
    prompt += `\n--- CONOCIMIENTOS DE ${aiName.toUpperCase()} ---\n`;
    for (const l of learnings) {
      prompt += `\n[${l.topic}]\n${l.content}\n`;
    }
    prompt += `\n--- FIN DE CONOCIMIENTOS ---\n`;
  }

  return prompt;
}

export async function generateReply(history: HistoryMsg[], slug = "platform"): Promise<string> {
  const systemPrompt = buildBaseSystemPrompt(slug);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 300, temperature: 0.7,
    });
    return response.choices[0]?.message?.content?.trim() ?? "Lo siento, no pude procesar tu mensaje.";
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.error(`[LLM] Error ${e.status ?? "?"}: ${e.message}`);
    return "Lo siento, estoy teniendo problemas técnicos. Por favor intenta de nuevo en un momento.";
  }
}

interface StructuredContext {
  products?: { id: number; name: string; price_per_person: number; description: string | null; ai_instructions?: string | null }[];
  companyName?: string;
  collectedData?: Record<string, unknown>;
}

const UNCERTAINTY_PHRASES = [
  "no tengo información","no cuento con","no dispongo",
  "no estoy seguro","no sé","no puedo responder",
  "déjame derivarte","derivarte con un asesor",
  "no tengo esa información","no conozco",
];

export function isUncertainResponse(text: string): boolean {
  return UNCERTAINTY_PHRASES.some(p => text.toLowerCase().includes(p));
}

export async function generateStructuredReply(
  history: HistoryMsg[],
  botState: string,
  ctx: StructuredContext,
  slug = "platform"
): Promise<string> {
  const { products = [], collectedData = {} } = ctx;
  const db = getCompanyDb(slug);
  const config = db.prepare("SELECT ai_name, name FROM company_config WHERE id=1").get() as { ai_name: string | null; name: string | null } | null;
  const aiName = config?.ai_name ?? "Julieta";
  const companyName = config?.name ?? ctx.companyName ?? "nuestra empresa";

  let systemPrompt = buildBaseSystemPrompt(slug);
  systemPrompt += `\nEstado actual de la conversación: ${botState}.`;
  systemPrompt += `\nEmpresa: ${companyName}.`;

  if (products.length > 0) {
    const productDetails = products.map(p =>
      `- ${p.name} ($${p.price_per_person.toLocaleString("es-CO")}/persona): ${p.description ?? ""}${p.ai_instructions ? `\n  → ${p.ai_instructions}` : ""}`
    ).join("\n");
    systemPrompt += `\n\nCatálogo disponible:\n${productDetails}`;
  }

  if (Object.keys(collectedData).length > 0) {
    systemPrompt += `\n\nDatos del prospecto: ${JSON.stringify(collectedData)}`;
  }

  systemPrompt += `\n\nIMPORTANTE: Responde en máximo 3 líneas. Si el usuario muestra interés en comprar, guíalo suavemente hacia elegir un producto del catálogo.`;
  void aiName;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = history.slice(-10).map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 250, temperature: 0.7,
    });
    return response.choices[0]?.message?.content?.trim() ?? "¿En qué más puedo ayudarte?";
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.error(`[LLM] Error ${e.status ?? "?"}: ${e.message}`);
    return "Disculpa, tuve un problema técnico. ¿Puedes repetir tu pregunta?";
  }
}
