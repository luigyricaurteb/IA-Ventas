export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import masterDb, { listCompanies } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import OpenAI from "openai";
import crypto from "node:crypto";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://hivo.app", "X-Title": "Aivox Platform" },
});

const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

type AgentId = "developer" | "pm" | "marketing" | "sales" | "assistant";

// ── Acciones ejecutables ──────────────────────────────────────────────────────
interface Action {
  type: string;
  params: Record<string, unknown>;
  description: string;
}

function executeAction(action: Action): { ok: boolean; result: string } {
  try {
    switch (action.type) {
      case "suspend_company": {
        const slug = String(action.params.slug ?? "");
        const c = masterDb.prepare("SELECT id FROM companies WHERE slug=?").get(slug) as { id: number } | null;
        if (!c) return { ok: false, result: `Empresa '${slug}' no encontrada` };
        masterDb.prepare("UPDATE companies SET status='suspended', updated_at=unixepoch() WHERE slug=?").run(slug);
        return { ok: true, result: `Empresa '${slug}' suspendida correctamente` };
      }
      case "activate_company": {
        const slug = String(action.params.slug ?? "");
        const c = masterDb.prepare("SELECT id FROM companies WHERE slug=?").get(slug) as { id: number } | null;
        if (!c) return { ok: false, result: `Empresa '${slug}' no encontrada` };
        masterDb.prepare("UPDATE companies SET status='active', updated_at=unixepoch() WHERE slug=?").run(slug);
        return { ok: true, result: `Empresa '${slug}' activada correctamente` };
      }
      case "close_ticket": {
        const ticketId = Number(action.params.ticket_id ?? 0);
        masterDb.prepare("UPDATE support_tickets SET status='closed', updated_at=unixepoch() WHERE id=?").run(ticketId);
        return { ok: true, result: `Ticket #${ticketId} cerrado` };
      }
      case "resolve_ticket": {
        const ticketId = Number(action.params.ticket_id ?? 0);
        masterDb.prepare("UPDATE support_tickets SET status='resolved', resolved_at=unixepoch(), updated_at=unixepoch() WHERE id=?").run(ticketId);
        return { ok: true, result: `Ticket #${ticketId} marcado como resuelto` };
      }
      case "reset_company_password": {
        const slug = String(action.params.slug ?? "");
        const username = String(action.params.username ?? "admin");
        const newPw = String(action.params.new_password ?? crypto.randomBytes(4).toString("hex"));
        try {
          const db = getCompanyDb(slug);
          const salt = crypto.randomBytes(16).toString("hex");
          const hash = crypto.pbkdf2Sync(newPw, salt, 100000, 64, "sha512").toString("hex");
          const res = db.prepare("UPDATE users SET password_hash=?, salt=? WHERE username=?").run(hash, salt, username);
          if ((res as { changes: number }).changes === 0) return { ok: false, result: `Usuario '${username}' no encontrado en '${slug}'` };
          return { ok: true, result: `Contraseña de '${username}' en '${slug}' cambiada a: ${newPw}` };
        } catch (e) { return { ok: false, result: `Error: ${(e as Error).message}` }; }
      }
      case "update_company_plan": {
        const slug = String(action.params.slug ?? "");
        const planName = String(action.params.plan_name ?? "");
        const plan = masterDb.prepare("SELECT id FROM plans WHERE name LIKE ? AND active=1").get(`%${planName}%`) as { id: number } | null;
        if (!plan) return { ok: false, result: `Plan '${planName}' no encontrado` };
        masterDb.prepare("UPDATE companies SET plan_id=?, updated_at=unixepoch() WHERE slug=?").run(plan.id, slug);
        return { ok: true, result: `Plan de '${slug}' actualizado a '${planName}'` };
      }
      case "enable_autopilot": {
        const slug = String(action.params.slug ?? "");
        try {
          const db = getCompanyDb(slug);
          db.prepare("UPDATE company_config SET autopilot_enabled=1 WHERE id=1").run();
          masterDb.prepare("UPDATE companies SET updated_at=unixepoch() WHERE slug=?").run(slug);
          return { ok: true, result: `Autopilot habilitado para '${slug}'` };
        } catch (e) { return { ok: false, result: `Error: ${(e as Error).message}` }; }
      }
      case "get_company_stats": {
        const slug = String(action.params.slug ?? "");
        try {
          const db = getCompanyDb(slug);
          const convCount = (db.prepare("SELECT COUNT(*) as c FROM conversations").get() as { c: number }).c;
          const msgCount = (db.prepare("SELECT COUNT(*) as c FROM messages").get() as { c: number }).c;
          const dealCount = (db.prepare("SELECT COUNT(*) as c FROM crm_deals").get() as { c: number }).c;
          const income = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM accounting_income").get() as { t: number }).t;
          return { ok: true, result: `Stats de '${slug}': ${convCount} conversaciones, ${msgCount} mensajes, ${dealCount} deals, $${income.toLocaleString("es-CO")} ingresos totales` };
        } catch (e) { return { ok: false, result: `Error: ${(e as Error).message}` }; }
      }
      default:
        return { ok: false, result: `Acción '${action.type}' no reconocida` };
    }
  } catch (e) {
    return { ok: false, result: `Error ejecutando acción: ${(e as Error).message}` };
  }
}

function getPlatformContext(): string {
  try {
    const companies = listCompanies();
    const active    = companies.filter(c => c.status === "active").length;
    const pending   = companies.filter(c => c.status === "pending").length;
    const suspended = companies.filter(c => c.status === "suspended").length;
    const totalTickets = (masterDb.prepare("SELECT COUNT(*) as c FROM support_tickets").get() as { c: number }).c;
    const openTickets  = (masterDb.prepare("SELECT COUNT(*) as c FROM support_tickets WHERE status='open'").get() as { c: number }).c;
    const plans = masterDb.prepare("SELECT name, price_monthly FROM plans WHERE active=1").all() as { name: string; price_monthly: number }[];

    const now = Math.floor(Date.now() / 1000);
    const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
    const activeSubs = masterDb.prepare("SELECT COALESCE(payment_amount,0) as a FROM subscriptions WHERE status='active'").all() as { a: number }[];
    const mrr = activeSubs.reduce((sum, s) => sum + s.a, 0);

    return `
CONTEXTO DE LA PLATAFORMA HIVO (${new Date().toLocaleDateString("es-CO")}):
- Empresas: ${companies.length} total | ${active} activas | ${suspended} suspendidas | ${pending} pendientes
- MRR estimado: $${mrr.toLocaleString("es-CO")} COP/mes
- Tickets: ${totalTickets} total | ${openTickets} abiertos
- Planes: ${plans.map(p => `${p.name}($${p.price_monthly.toLocaleString("es-CO")}/mes)`).join(", ")}
- Lista de empresas: ${companies.map(c => `${c.name}(slug:${c.slug}, estado:${c.status}, plan:${c.plan_name ?? "ninguno"})`).join(" | ")}

ACCIONES QUE PUEDES EJECUTAR (responde con JSON action si el usuario pide ejecutar algo):
- suspend_company: { slug }
- activate_company: { slug }
- close_ticket: { ticket_id }
- resolve_ticket: { ticket_id }
- reset_company_password: { slug, username, new_password }
- update_company_plan: { slug, plan_name }
- enable_autopilot: { slug }
- get_company_stats: { slug }

Si el usuario pide ejecutar una acción, incluye al final de tu respuesta un bloque JSON así:
<action>{"type":"nombre_accion","params":{"campo":"valor"},"description":"descripción breve"}</action>

Stack técnico: Next.js 15, TypeScript, SQLite (better-sqlite3), WhatsApp Cloud API, OpenRouter AI, Railway.
`;
  } catch { return "Plataforma Aivox - SaaS multi-empresa."; }
}

const AGENTS: Record<AgentId, { name: string; emoji: string; system: string }> = {
  developer: {
    name: "Dev Lead", emoji: "🧑‍💻",
    system: `Eres el desarrollador líder de Aivox, experto en Next.js 15, TypeScript, SQLite, WhatsApp Cloud API y Railway.
Conoces a fondo toda la arquitectura del sistema. Puedes explicar código, identificar bugs, diseñar features y ejecutar acciones técnicas.
Sé preciso y técnico. Da ejemplos de código cuando sea útil.`,
  },
  pm: {
    name: "Project Manager", emoji: "📋",
    system: `Eres el Director de Proyecto de Aivox. Gestionas el desarrollo del producto, priorizas features y planificas sprints.
Puedes crear planes estructurados, priorizar backlog, crear roadmaps y coordinar áreas. Sé estructurado con listas y prioridades.`,
  },
  marketing: {
    name: "Marketing Manager", emoji: "📈",
    system: `Eres el Gerente de Marketing de Aivox. Conoces el mercado SaaS latinoamericano y el sector turismo/hospitalidad.
Puedes crear estrategias de adquisición, escribir copy, diseñar campañas, analizar competencia y calcular métricas (CAC, LTV, MRR).`,
  },
  sales: {
    name: "Sales Manager", emoji: "💼",
    system: `Eres el Gerente de Ventas de Aivox. Tu objetivo es convertir prospectos y retener clientes.
Puedes crear scripts de venta, propuestas comerciales, estrategias de pricing y proyecciones de ingresos.`,
  },
  assistant: {
    name: "Asistente Personal", emoji: "🤖",
    system: `Eres el asistente personal del dueño de Aivox. Punto de contacto principal para cualquier necesidad — técnica, estratégica u operativa.
IMPORTANTE: Puedes ejecutar acciones reales en el sistema cuando el usuario lo pida. Si el usuario pide suspender/activar una empresa, resetear contraseña, cerrar ticket, etc., extrae los parámetros y devuelve la acción en el formato indicado.
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

    let reply = completion.choices[0]?.message?.content ?? "No pude generar una respuesta. Intenta de nuevo.";

    // Extract and execute action if present
    let actionResult: { ok: boolean; result: string } | null = null;
    const actionMatch = reply.match(/<action>([\s\S]*?)<\/action>/);
    if (actionMatch) {
      try {
        const action = JSON.parse(actionMatch[1]) as Action;
        actionResult = executeAction(action);
        // Remove action block from reply text
        reply = reply.replace(/<action>[\s\S]*?<\/action>/, "").trim();
        // Append result to reply
        reply += `\n\n${actionResult.ok ? "✅" : "❌"} *Acción ejecutada:* ${actionResult.result}`;
      } catch {}
    }

    return NextResponse.json({ reply, agent: body.agent, actionResult });
  } catch (e) {
    return NextResponse.json({ error: `Error de IA: ${(e as Error).message}` }, { status: 500 });
  }
}
