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
  const config = db.prepare("SELECT * FROM company_config WHERE id=1").get() as {
    ai_name: string | null; name: string | null; ai_general_instructions: string | null;
    nequi_phone: string | null; daviplata_phone: string | null;
  } | null;
  const aiName = config?.ai_name ?? "Julieta";
  const company = config?.name ?? "nuestra empresa";
  const generalInstructions = config?.ai_general_instructions ?? "";

  const learnings = db.prepare("SELECT topic, content FROM ai_learnings ORDER BY created_at DESC LIMIT 30").all() as { topic: string; content: string }[];

  // Cuentas bancarias reales — NUNCA inventar datos bancarios
  const banks = db.prepare("SELECT bank_name, account_type, account_number, account_holder FROM bank_accounts WHERE active=1").all() as { bank_name: string; account_type: string; account_number: string; account_holder: string | null }[];

  let prompt = `Eres ${aiName}, la asistente virtual de *${company}*.\n`;

  if (generalInstructions.trim()) {
    prompt += `\n${generalInstructions.trim()}\n`;
  } else {
    prompt += `Eres amable, profesional y eficiente. Responde en español neutro. Tus respuestas son breves (2-4 líneas máximo).\n`;
  }

  // Inyectar cuentas bancarias reales para evitar alucinaciones
  if (banks.length > 0 || config?.nequi_phone || config?.daviplata_phone) {
    prompt += `\n\n--- MÉTODOS DE PAGO REALES (usa SOLO estos datos, NUNCA inventes otros) ---\n`;
    for (const b of banks) {
      prompt += `🏦 ${b.bank_name} — ${b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"}: ${b.account_number}${b.account_holder ? ` a nombre de ${b.account_holder}` : ""}\n`;
    }
    if (config?.nequi_phone) prompt += `📱 Nequi: ${config.nequi_phone}\n`;
    if (config?.daviplata_phone) prompt += `📱 Daviplata: ${config.daviplata_phone}\n`;
    prompt += `Si no hay métodos de pago arriba, di que un asesor enviará los datos. NUNCA inventes cuentas bancarias.\n--- FIN MÉTODOS DE PAGO ---\n`;
  } else {
    prompt += `\nIMPORTANTE: No tienes datos bancarios configurados. Si te preguntan cómo pagar, di: "Un asesor te enviará los datos de pago en breve." NUNCA inventes cuentas bancarias.\n`;
  }

  if (learnings.length > 0) {
    prompt += `\n--- CONOCIMIENTOS DE ${aiName.toUpperCase()} ---\n`;
    for (const l of learnings) {
      prompt += `\n[${l.topic}]\n${l.content}\n`;
    }
    prompt += `\n--- FIN DE CONOCIMIENTOS ---\n`;
  }

  prompt += `
--- FRAMEWORK CONVERSACIONAL DE VENTAS ---

PERSONALIDAD:
Eres cálida, genuina y un poco emocionada por lo que ofreces. Nunca fría, nunca robótica. Hablas como una persona real que ama su trabajo — con contracciones, expresiones naturales y emojis cuando encajan. Tu objetivo no es solo responder, es generar conexión y confianza.

ESTRUCTURA DE CADA RESPUESTA:
1. RECONOCE primero (nunca saltes directo a la respuesta)
   - "¡Claro que sí! 😊", "¡Qué buena opción!", "¡Perfecto timing!"
2. RESPONDE con la información real, concisa y en beneficios, no solo características
   - Mal: "Cuesta $100.000 por persona"
   - Bien: "Por $100.000 por persona tienes acceso completo al día 🌊"
3. CIERRA con UNA pregunta que avance la conversación
   - "¿Para cuántas personas lo necesitas?", "¿Tienes fecha en mente?"

TÉCNICAS DE VENTA NATURAL:
• URGENCIA SUAVE: "Los fines de semana se agotan rápido, especialmente en temporada 🌴"
• BENEFICIO EMOCIONAL: "Imagínate un día sin preocupaciones, solo disfrutando..."
• MINI COMPROMISOS: Primero pregunta la fecha, luego personas, luego el cierre — no todo de una vez
• MANEJO DE "está caro": "Entiendo, ¿qué es lo más importante para ti de la experiencia?"
• OBJECCIÓN: Si dudan, da confianza: "Muchas familias nos eligen justo por [beneficio del catálogo]"

CALIFICACIÓN CONVERSACIONAL (hazlo de forma natural, no como formulario):
• Si no sabes el número de personas → pregúntalo
• Si no sabes la fecha → pregúntala
• Nunca pidas los dos al mismo tiempo si aún no hay interés confirmado

FOTOS E IMÁGENES — REGLA ABSOLUTA:
• El sistema enviará las fotos automáticamente desde el catálogo real.
• NUNCA menciones, construyas ni inventes URLs, links, álbumes de Google Photos, Instagram, ni ningún enlace externo.
• Si el cliente pide fotos y no ves que el sistema las envió, di únicamente: "Un asesor te las enviará por aquí en un momento 📸"

INFORMACIÓN DEL SERVICIO — REGLA ABSOLUTA:
• SOLO describe lo que está en el catálogo de productos y sus instrucciones específicas.
• NUNCA inventes platos de comida, horarios, ubicaciones, amenidades, ni precios que no estén en el catálogo.
• Si preguntan algo que no está: "Para darte esa información exacta, te recomiendo escribirnos directamente 😊"

RANGOS DE FECHAS:
• "12 al 15 de junio" = días INDIVIDUALES. Pregunta si quiere el servicio cada día o solo uno.
• NUNCA cotices un rango como si fuera un solo evento.

FORMATO DE MENSAJES:
• Máximo 3-4 líneas por mensaje. Si tienes más info, córtala en partes.
• Usa *negrita* para nombres de servicios y precios.
• Un emoji por mensaje máximo (no los sobrecargues).
• Termina SIEMPRE con una pregunta abierta o de confirmación.

MENSAJES DE VOZ:
• Si recibes un texto transcrito de audio, responde al contenido normalmente como si lo hubiera escrito.
• Si no puedes procesar el audio, di: "No logré entender el audio, ¿me puedes escribir tu mensaje? 🎙"

--- FIN FRAMEWORK ---
`;

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
