export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import nodemailer from "nodemailer";

interface SmtpRow {
  host: string | null; port: number; secure: number;
  user: string | null; password: string | null;
  from_name: string | null; from_email: string | null;
  provider: string | null; resend_api_key: string | null; resend_from: string | null;
}

function friendlyError(e: unknown): string {
  if (e === null || e === undefined) return "Error desconocido";
  if (typeof e === "string") return e;
  if (e instanceof Error) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "EAUTH" || e.message.includes("535") || e.message.includes("534") || e.message.includes("Username and Password"))
      return "Credenciales incorrectas. Para Gmail: usa una Contraseña de aplicación (no tu contraseña normal). Genera una en myaccount.google.com → Seguridad → Contraseñas de aplicaciones.";
    if (code === "ECONNREFUSED")
      return `No se pudo conectar al servidor (${code}). Verifica host y puerto.`;
    if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNRESET")
      return `Tiempo de conexión agotado (${code}). Verifica que el host y puerto sean correctos.`;
    if (code === "ENOTFOUND")
      return `Servidor SMTP no encontrado. Verifica que el host sea correcto (ej: smtp.gmail.com).`;
    if (e.message) return e.message;
  }
  try { return JSON.stringify(e); } catch { return String(e); }
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  try {
    const smtp = db.prepare("SELECT * FROM smtp_config WHERE id=1").get() as SmtpRow | null;
    const company = db.prepare("SELECT email, name FROM company_config WHERE id=1").get() as { email: string | null; name: string | null } | null;
    if (!company?.email) return NextResponse.json({ ok: false, error: "Falta el Correo de contacto en la pestaña Empresa — ese es el email que recibe las alertas" });

    const isResend = smtp?.provider === "resend";
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="color:#10b981;margin:0 0 8px">¡Email funcionando!</h2>
      <p style="color:#374151;margin:0 0 12px">Correo de prueba enviado desde <strong>${company.name ?? "tu empresa"}</strong> vía Aivox.</p>
      <p style="color:#6b7280;font-size:13px;margin:0">Las alertas de nuevas conversaciones, pagos y reservas llegarán correctamente.</p>
    </div>`;

    const isBrevo = smtp?.provider === "brevo";

    if (isBrevo) {
      if (!smtp?.resend_api_key) return NextResponse.json({ ok: false, error: "Falta la API Key de Brevo. Créala gratis en brevo.com → SMTP & API → API Keys" });
      const fromEmail = smtp.resend_from ?? smtp.from_email ?? smtp.user ?? "noreply@brevo.com";
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": smtp.resend_api_key, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: smtp.from_name ?? company.name ?? "Aivox", email: fromEmail },
          to: [{ email: company.email }],
          subject: "✅ Prueba Brevo — Aivox",
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const d = await res.json() as { messageId?: string; message?: string; code?: string };
      if (!res.ok) {
        let msg = d.message ?? String(res.status);
        if (msg.toLowerCase().includes("sender") || msg.toLowerCase().includes("not authorized")) {
          msg = `El email remitente "${fromEmail}" no está autorizado en Brevo. Usa el mismo email con el que te registraste en brevo.com, o agrégalo en Brevo → Senders & IPs → Senders.`;
        }
        return NextResponse.json({ ok: false, error: msg });
      }
      return NextResponse.json({ ok: true, sentTo: company.email, provider: "brevo" });
    }

    if (isResend) {
      // Resend — usa HTTPS port 443, nunca bloqueado
      if (!smtp?.resend_api_key) return NextResponse.json({ ok: false, error: "Falta la API Key de Resend. Créala gratis en resend.com" });
      const fromAddr = smtp.resend_from ?? "onboarding@resend.dev";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${smtp.resend_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `"${smtp.from_name ?? company.name ?? "Aivox"}" <${fromAddr}>`, to: [company.email], subject: "✅ Prueba Resend — Aivox", html }),
        signal: AbortSignal.timeout(15000),
      });
      const d = await res.json() as { id?: string; name?: string; message?: string };
      if (!res.ok) {
        let msg = d.message ?? d.name ?? String(res.status);
        if (msg.includes("domain is not verified") || msg.includes("gmail.com")) {
          msg = `El dominio del remitente no está verificado en Resend. Necesitas verificar un dominio propio en resend.com → Domains. Alternativa: usa Brevo (funciona con Gmail sin verificar dominio).`;
        }
        return NextResponse.json({ ok: false, error: msg });
      }
      return NextResponse.json({ ok: true, sentTo: company.email, provider: "resend" });
    }

    // SMTP tradicional
    if (!smtp?.host)     return NextResponse.json({ ok: false, error: "Falta el Servidor SMTP" });
    if (!smtp?.user)     return NextResponse.json({ ok: false, error: "Falta el Usuario / Email SMTP" });
    if (!smtp?.password) return NextResponse.json({ ok: false, error: "Falta la Contraseña de aplicación" });

    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port ?? 587, secure: smtp.secure === 1,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 10000,
    });
    await transporter.verify();
    await transporter.sendMail({
      from: `"${smtp.from_name ?? company.name ?? "Aivox"}" <${smtp.from_email ?? smtp.user}>`,
      to: company.email, subject: "✅ Prueba SMTP — Aivox", html,
    });
    return NextResponse.json({ ok: true, sentTo: company.email, provider: "smtp" });

  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: friendlyError(e) });
  }
}
