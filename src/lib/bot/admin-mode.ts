/**
 * Modo Admin por WhatsApp
 * El dueño escribe desde su número con la palabra clave y puede consultar
 * reservas, pagos pendientes, resúmenes del día, etc.
 */

import type Database from "better-sqlite3";

interface AdminCfg {
  admin_wa_phone: string | null;
  admin_wa_keyword: string | null;
  name: string | null;
}

interface Reservation {
  id: number; reservation_code: string | null; client_name: string | null;
  service_name: string | null; service_date: number; people_count: number;
  total_value: number | null; amount_paid: number; status: string;
}

function fmt(n: number) { return `$${n.toLocaleString("es-CO")}`; }
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short" });
}

export function isAdminPhone(db: Database.Database, phone: string): boolean {
  const cfg = db.prepare("SELECT admin_wa_phone FROM company_config WHERE id=1").get() as { admin_wa_phone: string | null } | null;
  if (!cfg?.admin_wa_phone) return false;
  const clean = (p: string) => p.replace(/\D/g, "");
  const stored = clean(cfg.admin_wa_phone);
  const incoming = clean(phone);
  // Match exactly, or if stored without country code match the suffix
  return incoming === stored || incoming.endsWith(stored) || stored.endsWith(incoming);
}

export function checkAdminKeyword(db: Database.Database, text: string): boolean {
  const cfg = db.prepare("SELECT admin_wa_keyword FROM company_config WHERE id=1").get() as { admin_wa_keyword: string | null } | null;
  const keyword = (cfg?.admin_wa_keyword ?? "admin").toLowerCase().trim();
  return text.toLowerCase().trim().startsWith(keyword);
}

export async function handleAdminQuery(db: Database.Database, text: string): Promise<string> {
  const q = text.toLowerCase().trim();
  const cfg = db.prepare("SELECT name FROM company_config WHERE id=1").get() as { name: string | null } | null;
  const companyName = cfg?.name ?? "la empresa";

  // ── Ayuda / comandos disponibles ─────────────────────────────────────────
  if (q.includes("ayuda") || q.includes("help") || q.includes("comandos")) {
    return `🔧 *Comandos disponibles:*

📅 *hoy* — reservas de hoy
📆 *mañana* — reservas de mañana
📋 *reservas pendientes* — con saldo por cobrar
💰 *cobros pendientes* — resumen de saldos
📊 *resumen* — resumen general del día
🔍 *reserva [código]* — estado de una reserva específica
👥 *clientes hoy* — quiénes llegan hoy

Escribe cualquier pregunta en lenguaje natural y te respondo.`;
  }

  // ── Reservas de HOY ───────────────────────────────────────────────────────
  if (q.includes("hoy") && !q.includes("mañana")) {
    const start = Math.floor(new Date().setHours(0,0,0,0) / 1000);
    const end   = Math.floor(new Date().setHours(23,59,59,999) / 1000);
    const rows  = db.prepare(
      "SELECT * FROM reservations WHERE service_date >= ? AND service_date <= ? ORDER BY service_date ASC"
    ).all(start, end) as Reservation[];

    if (rows.length === 0) return `📅 No hay reservas para hoy en ${companyName}.`;

    const total = rows.reduce((s, r) => s + (r.total_value ?? 0), 0);
    const cobrado = rows.reduce((s, r) => s + (r.amount_paid ?? 0), 0);
    const pendiente = rows.reduce((s, r) => s + Math.max(0, (r.total_value ?? 0) - (r.amount_paid ?? 0)), 0);

    const lista = rows.map(r => {
      const saldo = Math.max(0, (r.total_value ?? 0) - (r.amount_paid ?? 0));
      return `• ${r.client_name ?? "Sin nombre"} — ${r.service_name ?? "Servicio"} (${r.people_count} pax)${saldo > 0 ? ` ⚠️ Saldo: ${fmt(saldo)}` : " ✅"}`;
    }).join("\n");

    return `📅 *Reservas de hoy — ${rows.length} en total*\n\n${lista}\n\n💰 Total: ${fmt(total)} | Cobrado: ${fmt(cobrado)} | Pendiente: ${fmt(pendiente)}`;
  }

  // ── Reservas de MAÑANA ────────────────────────────────────────────────────
  if (q.includes("mañana")) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = Math.floor(new Date(tomorrow.setHours(0,0,0,0)).getTime() / 1000);
    const end   = Math.floor(new Date(tomorrow.setHours(23,59,59,999)).getTime() / 1000);
    const rows  = db.prepare(
      "SELECT * FROM reservations WHERE service_date >= ? AND service_date <= ? ORDER BY service_date ASC"
    ).all(start, end) as Reservation[];

    if (rows.length === 0) return `📆 No hay reservas para mañana.`;

    const lista = rows.map(r => {
      const saldo = Math.max(0, (r.total_value ?? 0) - (r.amount_paid ?? 0));
      return `• ${r.client_name ?? "Sin nombre"} — ${r.service_name ?? ""} (${r.people_count} pax)${saldo > 0 ? ` ⚠️ ${fmt(saldo)} pendiente` : " ✅ Pagado"}`;
    }).join("\n");

    return `📆 *Reservas de mañana — ${rows.length}*\n\n${lista}`;
  }

  // ── Reservas PENDIENTES de pago ───────────────────────────────────────────
  if (q.includes("pendiente") || q.includes("cobrar") || q.includes("saldo") || q.includes("debe")) {
    const rows = db.prepare(`
      SELECT * FROM reservations
      WHERE status != 'cancelled' AND total_value > 0 AND amount_paid < total_value
      ORDER BY service_date ASC LIMIT 20
    `).all() as Reservation[];

    if (rows.length === 0) return `✅ No hay reservas con saldo pendiente. ¡Todo cobrado!`;

    const totalPendiente = rows.reduce((s, r) => s + Math.max(0, (r.total_value ?? 0) - (r.amount_paid ?? 0)), 0);

    const lista = rows.map(r => {
      const saldo = Math.max(0, (r.total_value ?? 0) - (r.amount_paid ?? 0));
      return `• ${r.client_name ?? "Sin nombre"} (${fmtDate(r.service_date)}) — Saldo: *${fmt(saldo)}* | Código: ${r.reservation_code ?? `#${r.id}`}`;
    }).join("\n");

    return `💰 *Cobros pendientes — ${rows.length} reservas*\n\n${lista}\n\n*Total pendiente: ${fmt(totalPendiente)}*`;
  }

  // ── Buscar reserva por código o nombre ────────────────────────────────────
  const codeMatch = text.match(/RES-[\w-]+/i);
  if (codeMatch || q.includes("reserva ")) {
    let row: Reservation | null = null;

    if (codeMatch) {
      row = db.prepare("SELECT * FROM reservations WHERE reservation_code=? LIMIT 1").get(codeMatch[0].toUpperCase()) as Reservation | null;
    } else {
      // Buscar por nombre después de "reserva"
      const nameSearch = text.replace(/.*reserva\s+/i, "").trim();
      if (nameSearch.length > 2) {
        row = db.prepare("SELECT * FROM reservations WHERE client_name LIKE ? ORDER BY created_at DESC LIMIT 1").get(`%${nameSearch}%`) as Reservation | null;
      }
    }

    if (!row) return `🔍 No encontré esa reserva. Verifica el código o el nombre.`;

    const saldo = Math.max(0, (row.total_value ?? 0) - (row.amount_paid ?? 0));
    const statusMap: Record<string, string> = { pending: "⏳ Pendiente", confirmed: "✅ Confirmada", completed: "🏁 Completada", cancelled: "❌ Cancelada" };

    return `🔍 *Reserva ${row.reservation_code ?? `#${row.id}`}*\n\n` +
      `👤 Cliente: ${row.client_name ?? "Sin nombre"}\n` +
      `📦 Servicio: ${row.service_name ?? "—"}\n` +
      `📅 Fecha: ${fmtDate(row.service_date)}\n` +
      `👥 Personas: ${row.people_count}\n` +
      `💳 Estado: ${statusMap[row.status] ?? row.status}\n` +
      (row.total_value ? `💰 Total: ${fmt(row.total_value)}\n` : "") +
      (row.amount_paid > 0 ? `✅ Pagado: ${fmt(row.amount_paid)}\n` : "") +
      (saldo > 0 ? `⚠️ *Saldo: ${fmt(saldo)}*` : saldo === 0 && row.total_value ? `✅ Pago completo` : "");
  }

  // ── Resumen general ───────────────────────────────────────────────────────
  if (q.includes("resumen") || q.includes("estadistica") || q.includes("informe") || q.includes("reporte")) {
    const now = Math.floor(Date.now() / 1000);
    const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

    const totalRes = (db.prepare("SELECT COUNT(*) as c FROM reservations WHERE status != 'cancelled'").get() as { c: number }).c;
    const mesRes   = (db.prepare("SELECT COUNT(*) as c FROM reservations WHERE created_at >= ? AND status != 'cancelled'").get(monthStart) as { c: number }).c;
    const pendRes  = (db.prepare("SELECT COUNT(*) as c FROM reservations WHERE total_value > amount_paid AND status != 'cancelled'").get() as { c: number }).c;
    const hoyRes   = db.prepare("SELECT COUNT(*) as c FROM reservations WHERE service_date >= ? AND service_date <= ?").get(
      Math.floor(new Date().setHours(0,0,0,0) / 1000),
      Math.floor(new Date().setHours(23,59,59,999) / 1000)
    ) as { c: number };

    const ingresoMes = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM accounting_income WHERE created_at >= ?").get(monthStart) as { t: number } | null)?.t
      ?? (db.prepare("SELECT COALESCE(SUM(amount_paid),0) as t FROM reservations WHERE created_at >= ?").get(monthStart) as { t: number }).t;

    const pendienteMes = (db.prepare("SELECT COALESCE(SUM(MAX(0, total_value - amount_paid)),0) as t FROM reservations WHERE status != 'cancelled' AND total_value > 0").get() as { t: number }).t;

    return `📊 *Resumen ${companyName}*\n\n` +
      `📅 Reservas hoy: *${hoyRes.c}*\n` +
      `📆 Este mes: *${mesRes}* reservas\n` +
      `📋 Total activas: *${totalRes}*\n` +
      `⚠️ Con saldo pendiente: *${pendRes}*\n\n` +
      `💰 Ingresos del mes: *${fmt(ingresoMes)}*\n` +
      `🔴 Por cobrar (total): *${fmt(pendienteMes)}*`;
  }

  // ── Respuesta genérica ────────────────────────────────────────────────────
  return `🔧 *Modo Admin activo*\n\nPuedo ayudarte con:\n• reservas hoy / mañana\n• cobros pendientes\n• reserva [código]\n• resumen\n\nEscribe *ayuda* para ver todos los comandos.`;
}
