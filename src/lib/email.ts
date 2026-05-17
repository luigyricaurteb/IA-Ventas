import nodemailer from "nodemailer";
import { getSmtpConfig } from "./db";
import type Database from "better-sqlite3";

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const config = getSmtpConfig();
  if (!config.host || !config.user) {
    throw new Error("SMTP no configurado. Configúralo en Ajustes → SMTP.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure === 1,
    auth: { user: config.user, pass: config.password ?? "" },
  });

  const fromName = config.from_name ?? config.user;
  const fromEmail = config.from_email ?? config.user;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

// ── Alertas multi-empresa ────────────────────────────────────────────────────

type AlertType = "new_conversation" | "new_payment" | "new_reservation";

interface SmtpRow { host: string | null; port: number; secure: number; user: string | null; password: string | null; from_name: string | null; from_email: string | null }
interface CompanyCfg { email: string | null; name: string | null }
interface NotifyCfg { notify_new_conversation: number; notify_new_payment: number; notify_new_reservation: number }

function alertHtml(title: string, rows: string, companyName: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
.card{background:#fff;border-radius:12px;max-width:520px;margin:0 auto;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.badge{display:inline-block;background:#10b981;color:#fff;border-radius:6px;padding:4px 12px;font-size:13px;font-weight:bold;margin-bottom:16px}
h2{color:#1f2937;margin:0 0 4px;font-size:20px}.sub{color:#6b7280;font-size:13px;margin:0 0 20px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px}
.label{color:#6b7280}.value{color:#111827;font-weight:500;text-align:right;max-width:65%}
.footer{margin-top:24px;font-size:11px;color:#9ca3af;text-align:center}
</style></head><body><div class="card">
<div class="badge">Agente DMC</div>
<h2>${title}</h2><p class="sub">${companyName}</p>
${rows}
<div class="footer">Notificación automática · No responder este correo</div>
</div></body></html>`;
}

function r(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

export async function sendAlert(
  db: Database.Database,
  type: AlertType,
  data: Record<string, string | number | null | undefined>
): Promise<void> {
  try {
    // Check per-company notification flag
    const flagMap: Record<AlertType, keyof NotifyCfg> = {
      new_conversation: "notify_new_conversation",
      new_payment: "notify_new_payment",
      new_reservation: "notify_new_reservation",
    };
    const cfg = db.prepare("SELECT notify_new_conversation, notify_new_payment, notify_new_reservation FROM company_config WHERE id=1").get() as NotifyCfg | null;
    if (cfg?.[flagMap[type]] === 0) return; // disabled

    const smtp = db.prepare("SELECT * FROM smtp_config WHERE id=1").get() as SmtpRow | null;
    if (!smtp?.host || !smtp?.user || !smtp?.password) return; // no SMTP

    const company = db.prepare("SELECT email, name FROM company_config WHERE id=1").get() as CompanyCfg | null;
    if (!company?.email) return; // no recipient

    const cName = company.name ?? "Tu empresa";
    const fmt = (n: number) => `$${n.toLocaleString("es-CO")} COP`;

    let subject = "";
    let rows = "";

    if (type === "new_conversation") {
      subject = `💬 Nueva conversación — ${data.phone ?? ""}`;
      rows = r("Teléfono", data.phone) + r("Nombre", data.name) + r("Hora", data.time) + r("Mensaje", data.preview);
    } else if (type === "new_payment") {
      const amt = Number(data.amount ?? 0);
      subject = `💰 Pago aprobado — ${fmt(amt)}`;
      rows = r("Cliente", data.client)
           + r("Servicio", data.service)
           + r("Monto", fmt(amt))
           + r("Total pagado", fmt(Number(data.paid_total ?? 0)))
           + r("Saldo pendiente", Number(data.saldo ?? 0) > 0 ? fmt(Number(data.saldo)) : "Sin saldo")
           + r("Tipo", data.type === "full" ? "✅ Pago completo" : "🔄 Abono")
           + r("Referencia", data.reference)
           + r("Banco", data.bank)
           + r("Código reserva", data.reservation_code);
    } else if (type === "new_reservation") {
      subject = `📅 Nueva reserva — ${data.reservation_code ?? ""}`;
      rows = r("Código", data.reservation_code)
           + r("Cliente", data.client)
           + r("Servicio", data.service)
           + r("Fecha servicio", data.date)
           + r("Personas", data.people)
           + r("Total", data.total ? fmt(Number(data.total)) : null)
           + r("Estado", data.status === "confirmed" ? "✅ Confirmada" : "⏳ Pendiente de pago");
    }

    if (!subject) return;

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure === 1,
      auth: { user: smtp.user!, pass: smtp.password! },
    });

    await transporter.sendMail({
      from: `"${smtp.from_name ?? cName}" <${smtp.from_email ?? smtp.user}>`,
      to: company.email,
      subject,
      html: alertHtml(subject, rows, cName),
    });
  } catch (e) {
    console.error("[email:alert] Error:", (e as Error).message);
  }
}

export function renderTemplate(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
