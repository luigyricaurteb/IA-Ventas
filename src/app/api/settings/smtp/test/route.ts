export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import nodemailer from "nodemailer";

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
    const smtp = db.prepare("SELECT * FROM smtp_config WHERE id=1").get() as {
      host: string | null; port: number; secure: number;
      user: string | null; password: string | null; from_name: string | null; from_email: string | null;
    } | null;

    const company = db.prepare("SELECT email, name FROM company_config WHERE id=1").get() as {
      email: string | null; name: string | null;
    } | null;

    // Diagnósticos previos al intento de conexión
    if (!smtp?.host)     return NextResponse.json({ ok: false, error: "Falta el Servidor SMTP. Escribe smtp.gmail.com" });
    if (!smtp?.user)     return NextResponse.json({ ok: false, error: "Falta el Usuario / Email SMTP" });
    if (!smtp?.password) return NextResponse.json({ ok: false, error: "Falta la Contraseña de aplicación. Genera una en myaccount.google.com → Seguridad → Contraseñas de aplicaciones" });
    if (!company?.email) return NextResponse.json({ ok: false, error: "Falta el Correo de contacto en la pestaña Empresa — ese es el email que recibe las alertas" });

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure === 1,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 10000,
      greetingTimeout:    8000,
      socketTimeout:     10000,
    });

    // verify() prueba la autenticación sin enviar
    await transporter.verify();

    // Si verify pasó, enviamos el correo de prueba
    await transporter.sendMail({
      from: `"${smtp.from_name ?? company.name ?? "Agente DMC"}" <${smtp.from_email ?? smtp.user}>`,
      to: company.email,
      subject: "✅ Prueba SMTP — Agente DMC",
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#10b981;margin:0 0 8px">¡Conexión SMTP funcionando!</h2>
        <p style="color:#374151;margin:0 0 12px">Este correo de prueba fue enviado desde <strong>${company.name ?? "tu empresa"}</strong> a través de Agente DMC.</p>
        <p style="color:#6b7280;font-size:13px;margin:0">Las alertas de nuevas conversaciones, pagos y reservas llegarán a esta dirección correctamente.</p>
      </div>`,
    });

    return NextResponse.json({ ok: true, sentTo: company.email });

  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: friendlyError(e) });
  }
}
