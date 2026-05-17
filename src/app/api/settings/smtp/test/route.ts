export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const smtp = db.prepare("SELECT * FROM smtp_config WHERE id=1").get() as {
    host: string | null; port: number; secure: number;
    user: string | null; password: string | null; from_name: string | null; from_email: string | null;
  } | null;

  const company = db.prepare("SELECT email, name FROM company_config WHERE id=1").get() as {
    email: string | null; name: string | null;
  } | null;

  // Diagnóstico detallado
  if (!smtp?.host) return NextResponse.json({ ok: false, error: "Falta el Servidor SMTP" });
  if (!smtp?.user) return NextResponse.json({ ok: false, error: "Falta el Usuario / Email" });
  if (!smtp?.password) return NextResponse.json({ ok: false, error: "Falta la Contraseña de aplicación" });
  if (!company?.email) return NextResponse.json({ ok: false, error: "Falta el Correo de contacto en la pestaña Empresa (es el destinatario de las alertas)" });

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure === 1,
      auth: { user: smtp.user, pass: smtp.password },
    });

    await transporter.sendMail({
      from: `"${smtp.from_name ?? company.name ?? "Agente DMC"}" <${smtp.from_email ?? smtp.user}>`,
      to: company.email,
      subject: "✅ Prueba de email — Agente DMC",
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#10b981">¡Conexión SMTP funcionando!</h2>
        <p style="color:#374151">Este es un correo de prueba enviado desde <strong>${company.name ?? "tu empresa"}</strong> en Agente DMC.</p>
        <p style="color:#6b7280;font-size:13px">Si recibes este mensaje, las alertas de nuevas conversaciones, pagos y reservas llegarán correctamente.</p>
      </div>`,
    });

    return NextResponse.json({ ok: true, sentTo: company.email });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    let friendly = err.message ?? "Error desconocido";
    if (err.code === "EAUTH") friendly = "Credenciales incorrectas. Verifica usuario y contraseña de aplicación.";
    if (err.code === "ECONNREFUSED") friendly = "No se pudo conectar al servidor SMTP. Verifica host y puerto.";
    if (err.code === "ETIMEDOUT") friendly = "Tiempo de conexión agotado. Verifica el servidor SMTP.";
    return NextResponse.json({ ok: false, error: friendly });
  }
}
