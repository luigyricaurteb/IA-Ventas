/**
 * Modo Admin por WhatsApp — Julieta con acceso total a la DB
 *
 * DOS CAPAS DE CONOCIMIENTO SILENCIOSO:
 * Capa 1: Snapshot de todos los datos del negocio (reservas, ingresos, clientes, CRM, productos)
 * Capa 2: Contexto de conversaciones y patrones de clientes
 *
 * REGLA: Nada se escribe en ai_learnings → invisible en el módulo de Julieta
 * ACCESO: Solo el admin con la palabra clave configurada
 */

import type Database from "better-sqlite3";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "https://hivo.app", "X-Title": "Hivo Admin AI" },
});
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

// ── Verificación de acceso ────────────────────────────────────────────────────

export function isAdminPhone(db: Database.Database, phone: string): boolean {
  const cfg = db.prepare("SELECT admin_wa_phone, admin_mode_enabled FROM company_config WHERE id=1").get() as { admin_wa_phone: string | null; admin_mode_enabled: number } | null;
  // Feature must be enabled from master AND phone must match
  if (!cfg?.admin_mode_enabled || !cfg?.admin_wa_phone) return false;
  const clean = (p: string) => p.replace(/\D/g, "");
  const stored = clean(cfg.admin_wa_phone);
  const incoming = clean(phone);
  return incoming === stored || incoming.endsWith(stored) || stored.endsWith(incoming);
}

export function checkAdminKeyword(db: Database.Database, text: string): boolean {
  const cfg = db.prepare("SELECT admin_wa_keyword FROM company_config WHERE id=1").get() as { admin_wa_keyword: string | null } | null;
  const keyword = (cfg?.admin_wa_keyword ?? "admin").toLowerCase().trim();
  return text.toLowerCase().trim() === keyword || text.toLowerCase().trim().startsWith(keyword + " ");
}

// ── CAPA 1: Snapshot completo de la base de datos ─────────────────────────────

function buildDBSnapshot(db: Database.Database): string {
  const now = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
  const fmt = (n: number) => `$${n.toLocaleString("es-CO")} COP`;

  let snapshot = "";

  try {
    // Empresa
    const co = db.prepare("SELECT name, email, phone FROM company_config WHERE id=1").get() as { name: string | null; email: string | null; phone: string | null } | null;
    snapshot += `EMPRESA: ${co?.name ?? "Sin nombre"} | Email: ${co?.email ?? "-"} | Tel: ${co?.phone ?? "-"}\n\n`;
  } catch {}

  try {
    // Reservas
    const totalRes = (db.prepare("SELECT COUNT(*) as c FROM reservations WHERE status != 'cancelled'").get() as { c: number }).c;
    const hoyRes   = (db.prepare("SELECT COUNT(*) as c FROM reservations WHERE service_date >= ? AND service_date < ? + 86400").get(todayStart, todayStart) as { c: number }).c;
    const mesRes   = (db.prepare("SELECT COUNT(*) as c FROM reservations WHERE created_at >= ?").get(monthStart) as { c: number }).c;
    const pendRes  = (db.prepare("SELECT COUNT(*) as c FROM reservations WHERE total_value > amount_paid AND status != 'cancelled'").get() as { c: number }).c;
    const pendMonto = (db.prepare("SELECT COALESCE(SUM(MAX(0, total_value - amount_paid)),0) as t FROM reservations WHERE status != 'cancelled' AND total_value > 0").get() as { t: number }).t;

    snapshot += `=== RESERVAS ===\n`;
    snapshot += `Total activas: ${totalRes} | Hoy: ${hoyRes} | Este mes: ${mesRes}\n`;
    snapshot += `Con saldo pendiente: ${pendRes} (${fmt(pendMonto)} por cobrar)\n`;

    // Próximas reservas
    const proximas = db.prepare(`
      SELECT reservation_code, client_name, service_name, service_date, people_count,
             total_value, amount_paid, status
      FROM reservations
      WHERE service_date >= ? AND status != 'cancelled'
      ORDER BY service_date ASC LIMIT 10
    `).all(todayStart) as { reservation_code: string; client_name: string | null; service_name: string | null; service_date: number; people_count: number; total_value: number | null; amount_paid: number; status: string }[];

    if (proximas.length > 0) {
      snapshot += `\nPróximas reservas:\n`;
      for (const r of proximas) {
        const fecha = new Date(r.service_date * 1000).toLocaleDateString("es-CO");
        const saldo = Math.max(0, (r.total_value ?? 0) - (r.amount_paid ?? 0));
        snapshot += `  • ${fecha} | ${r.client_name ?? "Sin nombre"} | ${r.service_name ?? "-"} | ${r.people_count} pax | ${r.total_value ? fmt(r.total_value) : "S/N"}${saldo > 0 ? ` | SALDO: ${fmt(saldo)}` : ""} | ${r.status}\n`;
      }
    }
  } catch {}

  try {
    // Ingresos
    const ingresoMes = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM accounting_income WHERE income_date >= ?").get(monthStart) as { t: number }).t;
    const ingresoTotal = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM accounting_income").get() as { t: number }).t;
    const egresoMes = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM accounting_expense WHERE expense_date >= ?").get(monthStart) as { t: number }).t;

    snapshot += `\n=== CONTABILIDAD ===\n`;
    snapshot += `Ingresos este mes: ${fmt(ingresoMes)} | Total histórico: ${fmt(ingresoTotal)}\n`;
    snapshot += `Egresos este mes: ${fmt(egresoMes)} | Utilidad mes: ${fmt(ingresoMes - egresoMes)}\n`;

    // Últimos ingresos
    const ultIngresos = db.prepare(`
      SELECT client_name, service_name, amount, income_date, reservation_code
      FROM accounting_income ORDER BY income_date DESC LIMIT 5
    `).all() as { client_name: string | null; service_name: string | null; amount: number; income_date: number; reservation_code: string | null }[];

    if (ultIngresos.length > 0) {
      snapshot += `Últimos ingresos:\n`;
      for (const i of ultIngresos) {
        const fecha = new Date(i.income_date * 1000).toLocaleDateString("es-CO");
        snapshot += `  • ${fecha} | ${i.client_name ?? "-"} | ${i.service_name ?? "-"} | ${fmt(i.amount)}\n`;
      }
    }
  } catch {}

  try {
    // CRM
    const deals = db.prepare("SELECT stage, COUNT(*) as c, COALESCE(SUM(total_value),0) as v FROM crm_deals WHERE stage != 'PERDIDO' GROUP BY stage").all() as { stage: string; c: number; v: number }[];
    if (deals.length > 0) {
      snapshot += `\n=== CRM / PIPELINE ===\n`;
      for (const d of deals) {
        snapshot += `  ${d.stage}: ${d.c} deals (${fmt(d.v)})\n`;
      }
    }

    const convTotal = (db.prepare("SELECT COUNT(*) as c FROM conversations").get() as { c: number }).c;
    const convHoy   = (db.prepare("SELECT COUNT(*) as c FROM conversations WHERE last_message_at >= ?").get(todayStart) as { c: number }).c;
    snapshot += `Conversaciones totales: ${convTotal} | Activas hoy: ${convHoy}\n`;
  } catch {}

  try {
    // Productos
    const products = db.prepare("SELECT name, price_per_person, product_type, active FROM products").all() as { name: string; price_per_person: number; product_type: string; active: number }[];
    if (products.length > 0) {
      snapshot += `\n=== PRODUCTOS/SERVICIOS ===\n`;
      for (const p of products) {
        snapshot += `  • [${p.product_type}] ${p.name} — ${fmt(p.price_per_person)}/persona ${p.active ? "(activo)" : "(inactivo)"}\n`;
      }
    }
  } catch {}

  try {
    // Alertas pendientes
    const alertas = (db.prepare("SELECT COUNT(*) as c FROM payment_proofs WHERE reviewed=0").get() as { c: number }).c;
    if (alertas > 0) snapshot += `\n⚠️ ALERTAS PENDIENTES: ${alertas} comprobante(s) sin revisar\n`;
  } catch {}

  return snapshot;
}

// ── CAPA 2: Contexto de conversaciones y patrones ─────────────────────────────

function buildConversationContext(db: Database.Database): string {
  let context = "";

  try {
    // Temas más frecuentes en los aprendizajes automáticos
    const learnings = db.prepare(`
      SELECT topic, content FROM ai_learnings
      WHERE source = 'auto' ORDER BY created_at DESC LIMIT 15
    `).all() as { topic: string; content: string }[];

    if (learnings.length > 0) {
      context += `Preguntas frecuentes de clientes (aprendizaje automático):\n`;
      for (const l of learnings) {
        context += `  • ${l.topic}: ${l.content.slice(0, 80)}\n`;
      }
    }
  } catch {}

  try {
    // Últimas conversaciones activas
    const convs = db.prepare(`
      SELECT c.phone, c.name, c.last_message_preview, c.mode,
             m.content as last_msg
      FROM conversations c
      LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1)
      WHERE c.last_message_at IS NOT NULL
      ORDER BY c.last_message_at DESC LIMIT 10
    `).all() as { phone: string; name: string | null; last_message_preview: string | null; mode: string; last_msg: string | null }[];

    if (convs.length > 0) {
      context += `\nÚltimas conversaciones:\n`;
      for (const c of convs) {
        context += `  • ${c.name ?? c.phone} (${c.mode}): "${(c.last_message_preview ?? c.last_msg ?? "").slice(0, 60)}"\n`;
      }
    }
  } catch {}

  try {
    // Top productos más vendidos
    const top = db.prepare(`
      SELECT p.name, COUNT(*) as ventas, SUM(d.total_value) as revenue
      FROM crm_deals d JOIN products p ON d.product_id = p.id
      WHERE d.stage = 'CERRADO_GANADO' OR d.stage = 'GANADO'
      GROUP BY p.id ORDER BY ventas DESC LIMIT 5
    `).all() as { name: string; ventas: number; revenue: number }[];

    if (top.length > 0) {
      context += `\nProductos más vendidos:\n`;
      for (const t of top) {
        context += `  • ${t.name}: ${t.ventas} ventas ($${t.revenue?.toLocaleString("es-CO") ?? 0} COP)\n`;
      }
    }
  } catch {}

  return context || "Sin datos de conversaciones disponibles aún.";
}

// ── Consulta principal con IA ────────────────────────────────────────────────

export async function handleAdminQuery(
  db: Database.Database,
  text: string,
  history: { role: string; content: string }[] = []
): Promise<string> {
  const cfg = db.prepare("SELECT name, ai_name FROM company_config WHERE id=1").get() as { name: string | null; ai_name: string | null } | null;
  const companyName = cfg?.name ?? "la empresa";
  const aiName = cfg?.ai_name ?? "Julieta";

  // Construir las dos capas de conocimiento
  const layer1 = buildDBSnapshot(db);
  const layer2 = buildConversationContext(db);

  const systemPrompt = `Eres ${aiName} en MODO ADMIN PRIVADO de *${companyName}*.

Solo el administrador autorizado puede hablar contigo en este modo.
Tienes acceso completo y en tiempo real a todos los datos del negocio.
Responde con datos exactos. Sé directo, conciso y útil.
No menciones que estás en modo admin ni que tienes acceso a datos — simplemente responde.
Si no tienes el dato exacto, dilo claramente.

════════════════════════════════════════
CAPA 1 — DATOS DEL NEGOCIO (tiempo real)
════════════════════════════════════════
${layer1}

════════════════════════════════════════
CAPA 2 — CONVERSACIONES Y PATRONES
════════════════════════════════════════
${layer2}

REGLAS:
- Responde siempre en español
- Usa los datos reales de arriba para responder
- Si el admin pide un reporte, formatealo claramente
- Puedes hacer cálculos con los datos disponibles
- Nunca inventes datos que no estén en el contexto`;

  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.slice(-8).map(m => ({
        role: m.role === "user" ? "user" as const : "assistant" as const,
        content: m.content,
      })),
      { role: "user" as const, content: text },
    ];

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.3, // Más determinístico para datos de negocio
      max_tokens: 800,
    });

    return completion.choices[0]?.message?.content?.trim() ?? "No pude procesar tu consulta. Intenta de nuevo.";
  } catch (e) {
    console.error("[admin-ai] Error:", (e as Error).message);
    // Fallback a respuestas hardcodeadas si la IA falla
    return fallbackQuery(db, text);
  }
}

// ── Fallback si la IA no responde ────────────────────────────────────────────

function fallbackQuery(db: Database.Database, text: string): string {
  const q = text.toLowerCase();
  const fmt = (n: number) => `$${n.toLocaleString("es-CO")} COP`;
  const todayStart = Math.floor(new Date().setHours(0,0,0,0) / 1000);

  if (q.includes("hoy")) {
    const rows = db.prepare("SELECT * FROM reservations WHERE service_date >= ? AND service_date < ? + 86400 ORDER BY service_date ASC").all(todayStart, todayStart) as { client_name: string | null; service_name: string | null; people_count: number; total_value: number | null; amount_paid: number }[];
    if (!rows.length) return "No hay reservas para hoy.";
    const lista = rows.map(r => `• ${r.client_name ?? "-"} | ${r.service_name ?? "-"} | ${r.people_count} pax | ${r.total_value ? fmt(r.total_value) : "S/N"}`).join("\n");
    return `📅 Reservas de hoy (${rows.length}):\n\n${lista}`;
  }
  if (q.includes("pendiente") || q.includes("cobrar")) {
    const rows = db.prepare("SELECT * FROM reservations WHERE total_value > amount_paid AND status != 'cancelled' LIMIT 10").all() as { client_name: string | null; reservation_code: string | null; total_value: number; amount_paid: number }[];
    if (!rows.length) return "✅ No hay saldos pendientes.";
    const total = rows.reduce((s, r) => s + Math.max(0, r.total_value - r.amount_paid), 0);
    const lista = rows.map(r => `• ${r.client_name ?? "-"} | ${r.reservation_code ?? "-"} | Saldo: ${fmt(Math.max(0, r.total_value - r.amount_paid))}`).join("\n");
    return `💰 Cobros pendientes:\n\n${lista}\n\nTotal: ${fmt(total)}`;
  }
  return `🔧 Modo Admin activo.\n\nEscribe *ayuda* para ver comandos disponibles, o hazme cualquier pregunta sobre el negocio.`;
}
