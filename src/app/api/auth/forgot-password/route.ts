export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const body = await req.json() as { username: string; company?: string };
  const { username, company } = body;

  if (!username) return NextResponse.json({ error: "Ingresa tu usuario" }, { status: 400 });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hora
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://disciplined-rejoicing-production-a444.up.railway.app`;

  // ── Master user ─────────────────────────────────────────────────────────
  if (!company || company === "__master__") {
    const user = masterDb.prepare("SELECT username, email FROM master_users WHERE username=? AND active=1").get(username) as { username: string; email: string | null } | null;
    if (!user) return NextResponse.json({ ok: true }); // No revelar si existe

    masterDb.prepare(`
      INSERT INTO password_reset_tokens (token, user_type, company_slug, username, expires_at)
      VALUES (?, 'master', NULL, ?, ?)
    `).run(token, username, expiresAt);

    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    const email = user.email ?? process.env.MASTER_EMAIL;
    if (email) {
      await sendEmail(email, "Restablecer contraseña — Hivo",
        `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="color:#0077b6">Restablecer contraseña</h2>
          <p>Hola <strong>${user.username}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#0077b6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Restablecer contraseña</a>
          <p style="color:#6b7280;font-size:13px">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este mensaje.</p>
        </div>`
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // ── Company user ────────────────────────────────────────────────────────
  try {
    const companyRow = masterDb.prepare("SELECT slug FROM companies WHERE slug=? AND status='active'").get(company) as { slug: string } | null;
    if (!companyRow) return NextResponse.json({ ok: true });

    const db = getCompanyDb(company);
    const user = db.prepare("SELECT username, email FROM users WHERE username=? AND active=1").get(username) as { username: string; email: string | null } | null;
    if (!user) return NextResponse.json({ ok: true });

    // Get company email as fallback
    const cfg = db.prepare("SELECT email, name FROM company_config WHERE id=1").get() as { email: string | null; name: string | null } | null;
    const recipientEmail = user.email ?? cfg?.email;
    if (!recipientEmail) return NextResponse.json({ ok: true });

    masterDb.prepare(`
      INSERT INTO password_reset_tokens (token, user_type, company_slug, username, expires_at)
      VALUES (?, 'company', ?, ?, ?)
    `).run(token, company, username, expiresAt);

    const resetUrl = `${baseUrl}/reset-password?token=${token}&company=${company}`;
    await sendEmail(recipientEmail, "Restablecer contraseña — Hivo",
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#0077b6">Restablecer contraseña</h2>
        <p>Hola <strong>${user.username}</strong> de <strong>${cfg?.name ?? company}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#0077b6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Restablecer contraseña</a>
        <p style="color:#6b7280;font-size:13px">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este mensaje.</p>
      </div>`
    ).catch(() => {});
  } catch {}

  return NextResponse.json({ ok: true });
}
