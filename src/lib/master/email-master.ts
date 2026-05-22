/**
 * Emails del sistema Aivox (nivel master/plataforma).
 * Usa el SMTP de la empresa "platform" para enviar desde la propia plataforma.
 */
import nodemailer from "nodemailer";
import { getCompanyDb } from "./db-company";

interface SmtpRow {
  host: string | null; port: number; secure: number;
  user: string | null; password: string | null;
  from_name: string | null; from_email: string | null;
  provider: string | null; resend_api_key: string | null; resend_from: string | null;
}

async function sendMasterEmail(to: string, subject: string, html: string): Promise<void> {
  const db   = getCompanyDb("platform");
  const smtp = db.prepare("SELECT * FROM smtp_config WHERE id=1").get() as SmtpRow | null;

  if (!smtp?.host && !smtp?.resend_api_key) {
    console.warn("[email-master] SMTP no configurado en la empresa platform.");
    return;
  }

  if (smtp.provider === "resend" && smtp.resend_api_key) {
    const fromAddr = smtp.resend_from || "noreply@aivoxgroup.com";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${smtp.resend_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `"${smtp.from_name ?? "Aivox"}" <${fromAddr}>`, to: [to], subject, html }),
    });
    return;
  }

  if (smtp.provider === "brevo" && smtp.resend_api_key) {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": smtp.resend_api_key, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: smtp.from_name ?? "Aivox", email: smtp.resend_from ?? smtp.from_email ?? smtp.user },
        to: [{ email: to }], subject, htmlContent: html,
      }),
    });
    return;
  }

  if (smtp.host && smtp.user) {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: smtp.port ?? 587, secure: smtp.secure === 1,
      auth: { user: smtp.user, pass: smtp.password ?? "" },
    });
    const fromAddr = smtp.from_email ?? smtp.user;
    await transporter.sendMail({
      from: `"${smtp.from_name ?? "Aivox"}" <${fromAddr}>`,
      to, subject, html,
    });
  }
}

// ── Plantillas de email ─────────────────────────────────────────────────────

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f0f4f8;margin:0;padding:24px}
  .card{background:#fff;border-radius:16px;max-width:560px;margin:0 auto;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#1e1b4b,#0077b6);padding:32px;text-align:center}
  .header h1{color:#fff;margin:0;font-size:24px;font-weight:800}
  .header p{color:rgba(255,255,255,.75);margin:8px 0 0;font-size:14px}
  .body{padding:32px}
  .body p{color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px}
  .btn{display:inline-block;background:linear-gradient(135deg,#1e1b4b,#0077b6);color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;margin:8px 0}
  .box{background:#f8fafc;border-radius:10px;padding:16px 20px;margin:16px 0;border-left:4px solid #0077b6}
  .box p{margin:4px 0;font-size:14px}
  .box strong{color:#1e1b4b}
  .footer{text-align:center;padding:20px;color:#9ca3af;font-size:12px}
  .step{display:flex;align-items:flex-start;gap:12px;margin:12px 0}
  .step-num{background:#0077b6;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0}
  .step-text{font-size:14px;color:#374151;padding-top:4px}
</style></head><body>
<div class="card">
  <div class="header">
    <h1>🚀 Aivox</h1>
    <p>Plataforma de ventas inteligente con IA</p>
  </div>
  <div class="body">
    <p style="font-size:20px;font-weight:700;color:#1e1b4b;margin-bottom:8px">${title}</p>
    ${body}
  </div>
  <div class="footer">Aivox · aivoxgroup.com · No respondas este correo</div>
</div></body></html>`;
}

export async function sendWelcomeEmail(opts: {
  to: string; companyName: string; username: string; password: string; loginUrl: string;
}): Promise<void> {
  const html = baseTemplate(
    `¡Bienvenido a Aivox, ${opts.companyName}! 🎉`,
    `<p>Tu cuenta está activa y lista para usar. Aquí están tus datos de acceso:</p>
    <div class="box">
      <p><strong>URL de acceso:</strong> ${opts.loginUrl}</p>
      <p><strong>Usuario:</strong> ${opts.username}</p>
      <p><strong>Contraseña:</strong> ${opts.password}</p>
    </div>
    <p>Una vez dentro, el asistente de configuración te guiará paso a paso. Estos son los primeros pasos:</p>
    <div class="step"><div class="step-num">1</div><div class="step-text"><strong>Configura tu empresa</strong> — nombre, logo, datos de contacto</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-text"><strong>Personaliza a Julieta</strong> — el tono y nombre de tu asistente IA</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-text"><strong>Agrega tus productos o servicios</strong> — con fotos y precios</div></div>
    <div class="step"><div class="step-num">4</div><div class="step-text"><strong>Conecta WhatsApp</strong> — sigue el asistente de conexión</div></div>
    <p style="margin-top:24px">
      <a href="${opts.loginUrl}" class="btn">Entrar al sistema →</a>
    </p>
    <p style="font-size:13px;color:#6b7280;margin-top:16px">
      ¿Necesitas ayuda? Escríbenos a <a href="mailto:hola@aivoxgroup.com" style="color:#0077b6">hola@aivoxgroup.com</a>
    </p>`
  );
  await sendMasterEmail(opts.to, `¡Bienvenido a Aivox! Tu cuenta está lista, ${opts.companyName}`, html);
}

export async function sendPaymentProofNotification(opts: {
  masterEmail: string; companyName: string; slug: string; plan: string;
  amount: number; proofUrl: string; activateUrl: string;
}): Promise<void> {
  const html = baseTemplate(
    "Nuevo comprobante de pago recibido",
    `<p>Una empresa acaba de subir su comprobante de pago y está esperando activación.</p>
    <div class="box">
      <p><strong>Empresa:</strong> ${opts.companyName}</p>
      <p><strong>Slug:</strong> ${opts.slug}</p>
      <p><strong>Plan:</strong> ${opts.plan}</p>
      <p><strong>Monto declarado:</strong> $${opts.amount.toLocaleString("es-CO")} COP</p>
    </div>
    <p>
      <a href="${opts.activateUrl}" class="btn">Ver y Activar empresa →</a>
    </p>
    <p style="font-size:13px;color:#6b7280">
      También puedes activarla desde el panel master → Empresas → ${opts.companyName}
    </p>`
  );
  await sendMasterEmail(opts.masterEmail, `[Aivox] Comprobante recibido — ${opts.companyName}`, html);
}

export async function sendPaymentConfirmedEmail(opts: {
  to: string; companyName: string; plan: string; amount: number;
}): Promise<void> {
  const html = baseTemplate(
    "Pago confirmado ✅",
    `<p>Tu pago ha sido confirmado. Tu cuenta de <strong>${opts.companyName}</strong> en el plan <strong>${opts.plan}</strong> está activa.</p>
    <div class="box">
      <p><strong>Monto:</strong> $${opts.amount.toLocaleString("es-CO")} COP</p>
      <p><strong>Estado:</strong> Confirmado</p>
    </div>
    <p>Tu cuenta ya está activa. Ingresa al sistema y comienza a configurarla:</p>
    <p><a href="https://aivoxgroup.com/login" class="btn">Entrar al sistema →</a></p>`
  );
  await sendMasterEmail(opts.to, `[Aivox] Pago confirmado — ${opts.companyName}`, html);
}

export async function sendRegistrationReceivedEmail(opts: {
  to: string; companyName: string; plan: string; paymentMethod: "card" | "transfer";
}): Promise<void> {
  const isCard = opts.paymentMethod === "card";
  const html = baseTemplate(
    "Solicitud recibida 📬",
    `<p>Hola, recibimos tu solicitud de registro para <strong>${opts.companyName}</strong>.</p>
    ${isCard
      ? `<p>Tu pago con tarjeta está siendo procesado. En cuanto se confirme, recibirás tus credenciales de acceso por este correo.</p>`
      : `<p>Recibimos tu comprobante de pago. Lo verificaremos en las próximas horas y recibirás tus credenciales de acceso por este correo.</p>`
    }
    <div class="box">
      <p><strong>Empresa:</strong> ${opts.companyName}</p>
      <p><strong>Plan:</strong> ${opts.plan}</p>
      <p><strong>Método de pago:</strong> ${isCard ? "Tarjeta de crédito/débito" : "Transferencia bancaria"}</p>
    </div>
    <p style="font-size:13px;color:#6b7280">
      ¿Tienes preguntas? Escríbenos a <a href="mailto:hola@aivoxgroup.com" style="color:#0077b6">hola@aivoxgroup.com</a>
    </p>`
  );
  await sendMasterEmail(opts.to, `[Aivox] Solicitud recibida — ${opts.companyName}`, html);
}
