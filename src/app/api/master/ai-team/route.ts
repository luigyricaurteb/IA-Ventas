export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import masterDb, { listCompanies } from "@/lib/master/db-master";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://hivo.app", "X-Title": "Hivo Platform" },
});

const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

type AgentId = "developer" | "pm" | "marketing" | "sales" | "assistant";

function getPlatformContext(): string {
  try {
    const companies = listCompanies();
    const active    = companies.filter(c => c.status === "active").length;
    const pending   = companies.filter(c => c.status === "pending").length;
    const totalTickets = (masterDb.prepare("SELECT COUNT(*) as c FROM support_tickets").get() as { c: number }).c;
    const openTickets  = (masterDb.prepare("SELECT COUNT(*) as c FROM support_tickets WHERE status='open'").get() as { c: number }).c;
    const plans = masterDb.prepare("SELECT name, price_monthly FROM plans WHERE active=1").all() as { name: string; price_monthly: number }[];

    return `
CONTEXTO DE LA PLATAFORMA HIVO (${new Date().toLocaleDateString("es-CO")}):
- Empresas activas: ${active} | Pendientes de activación: ${pending} | Total: ${companies.length}
- Tickets de soporte: ${totalTickets} total, ${openTickets} abiertos
- Planes disponibles: ${plans.map(p => `${p.name} ($${p.price_monthly.toLocaleString("es-CO")}/mes)`).join(", ")}
- Empresas: ${companies.slice(0, 10).map(c => `${c.name} (${c.status})`).join(", ")}${companies.length > 10 ? ` y ${companies.length - 10} más` : ""}

El sistema Hivo es una plataforma SaaS multi-empresa con: WhatsApp Cloud API, CRM, Calendario de reservas, Contabilidad, Productos, Campañas, Documentos, Analytics, Google Sheets sync, sistema de tickets y modo admin por WhatsApp.
Stack: Next.js 15, TypeScript, SQLite (better-sqlite3), Tailwind CSS, OpenRouter AI, Railway (hosting).
`;
  } catch { return "Plataforma Hivo - SaaS multi-empresa para gestión de WhatsApp y ventas."; }
}

const AGENTS: Record<AgentId, { name: string; emoji: string; system: string }> = {
  developer: {
    name: "Dev Lead", emoji: "🧑‍💻",
    system: `Eres el desarrollador líder de Hivo, experto en Next.js 15, TypeScript, SQLite, WhatsApp Cloud API y Railway.
Conoces a fondo toda la arquitectura del sistema. Puedes:
- Explicar cómo funciona cualquier parte del código
- Identificar y proponer fixes para bugs
- Diseñar nuevas funcionalidades
- Revisar y optimizar código
- Explicar errores técnicos en términos claros
Sé preciso, técnico cuando es necesario, y siempre da ejemplos concretos de código cuando sea útil.`,
  },
  pm: {
    name: "Project Manager", emoji: "📋",
    system: `Eres el Director de Proyecto de Hivo. Tu rol es gestionar el desarrollo del producto, priorizar features, planificar sprints y asegurarte de que el equipo avance según la visión del producto.
Puedes:
- Crear planes de desarrollo estructurados
- Priorizar backlog según impacto/esfuerzo
- Identificar riesgos y dependencias
- Sugerir metodologías ágiles
- Crear roadmaps y timelines realistas
- Coordinar entre áreas (tech, marketing, ventas)
Sé estructurado, usa listas y prioridades claras.`,
  },
  marketing: {
    name: "Marketing Manager", emoji: "📈",
    system: `Eres el Gerente de Marketing de Hivo. Conoces el mercado de SaaS para PYMES latinoamericanas y el sector turismo/hospitalidad (Beachland es un cliente clave).
Puedes:
- Crear estrategias de adquisición de clientes
- Escribir copy para landing pages, ads y emails
- Diseñar campañas de WhatsApp marketing
- Analizar competencia (Crisp, Tidio, ManyChat, Intercom)
- Sugerir estrategias de contenido y SEO
- Proponer casos de uso para diferentes industrias
- Calcular métricas clave (CAC, LTV, MRR, churn)
Sé creativo, orientado a resultados y piensa en el mercado colombiano y latinoamericano.`,
  },
  sales: {
    name: "Sales Manager", emoji: "💼",
    system: `Eres el Gerente de Ventas de Hivo. Tu objetivo es convertir prospectos en clientes pagos y retener los existentes.
Puedes:
- Crear scripts de ventas y objeciones
- Diseñar propuestas comerciales personalizadas
- Sugerir estrategias de pricing y upsell
- Crear procesos de onboarding de clientes
- Analizar por qué los clientes no convierten
- Proponer alianzas con agencias y revendedores
- Calcular proyecciones de ingresos
Sé persuasivo, orientado a resultados, y enfocado en el valor que Hivo da a los negocios.`,
  },
  assistant: {
    name: "Asistente Personal", emoji: "🤖",
    system: `Eres el asistente personal del dueño de Hivo. Tu rol es ser el punto de contacto principal para cualquier necesidad — técnica, estratégica, operativa o creativa.
Puedes:
- Responder cualquier pregunta sobre el sistema
- Ayudar a priorizar decisiones del día a día
- Redactar comunicaciones y documentos
- Hacer seguimiento de pendientes
- Coordinar con los otros agentes del equipo
- Dar recomendaciones basadas en mejores prácticas
- Ser un sparring partner para ideas de negocio
Sé proactivo, conciso y siempre termina con una sugerencia de siguiente paso.`,
  },
};

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const me = getUserFromToken(token);
  if (!me || me.role !== "master") return NextResponse.json({ error: "Solo accesible para master" }, { status: 403 });

  const body = await req.json() as {
    agent: AgentId;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const agent = AGENTS[body.agent];
  if (!agent) return NextResponse.json({ error: "Agente no encontrado" }, { status: 400 });

  const platformCtx = getPlatformContext();
  const systemPrompt = `${agent.system}\n\n${platformCtx}`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...body.messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const reply = completion.choices[0]?.message?.content ?? "No pude generar una respuesta. Intenta de nuevo.";
    return NextResponse.json({ reply, agent: body.agent });
  } catch (e) {
    return NextResponse.json({ error: `Error de IA: ${(e as Error).message}` }, { status: 500 });
  }
}
