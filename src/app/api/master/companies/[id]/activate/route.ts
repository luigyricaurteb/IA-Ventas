export const dynamic = "force-dynamic";
/**
 * Activar empresa manualmente desde el panel master.
 * Al activar: cambia el status a "active", activa la suscripción,
 * y envía email de bienvenida con credenciales al cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { sendWelcomeEmail } from "@/lib/master/email-master";

interface Ctx { params: Promise<{ id: string }> }

const requireMaster = (req: NextRequest) =>
  getUserFromToken(req.cookies.get("session_token")?.value ?? "")?.role === "master";

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { id } = await params;
  const companyId = Number(id);

  const company = masterDb.prepare(
    "SELECT id, slug, name, email, plan_id FROM companies WHERE id=?"
  ).get(companyId) as { id: number; slug: string; name: string; email: string; plan_id: number | null } | null;

  if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const now    = Math.floor(Date.now() / 1000);
  const endsAt = now + 30 * 86400;

  // Activar empresa
  masterDb.prepare("UPDATE companies SET status='active', updated_at=? WHERE id=?").run(now, companyId);

  // Activar suscripción pendiente más reciente
  const sub = masterDb.prepare(
    "SELECT id FROM subscriptions WHERE company_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1"
  ).get(companyId) as { id: number } | null;

  if (sub) {
    masterDb.prepare(
      "UPDATE subscriptions SET status='active', starts_at=?, ends_at=?, approved_at=? WHERE id=?"
    ).run(now, endsAt, now, sub.id);
    // Cancelar otras pending
    masterDb.prepare(
      "UPDATE subscriptions SET status='cancelled' WHERE company_id=? AND id!=? AND status='pending'"
    ).run(companyId, sub.id);
  }

  // Obtener credenciales del admin para el email de bienvenida
  const db        = getCompanyDb(company.slug);
  const adminUser = db.prepare("SELECT username FROM users WHERE is_admin=1 LIMIT 1").get() as { username: string } | null;
  const plan      = company.plan_id
    ? masterDb.prepare("SELECT name FROM plans WHERE id=?").get(company.plan_id) as { name: string } | null
    : null;

  void plan;

  // Enviar email de bienvenida
  if (company.email && adminUser) {
    sendWelcomeEmail({
      to: company.email,
      companyName: company.name,
      username: adminUser.username,
      password: "La que elegiste al registrarte",
      loginUrl: "https://aivoxgroup.com/login",
    }).catch(e => console.warn("[activate] email bienvenida:", (e as Error).message));
  }

  console.log(`[activate] Empresa ${company.name} (${company.slug}) activada manualmente`);

  return NextResponse.json({ ok: true, slug: company.slug, name: company.name });
}
