export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import masterDb, { createCompany, listPlans } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { hashPassword, sanitizeInput } from "@/lib/auth";
import crypto from "node:crypto";

export async function GET() {
  const plans = listPlans().filter(p => p.active && p.price_monthly > 0);
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    company_name: string; slug: string; email: string; phone?: string;
    plan_id: number; admin_username: string; admin_password: string;
    nit?: string;
  };

  if (!body.company_name || !body.slug || !body.email || !body.admin_username || !body.admin_password) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }
  if (body.admin_password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
  }

  const slug = String(body.slug).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50);
  if (!slug || slug.length < 3) return NextResponse.json({ error: "Identificador inválido (mínimo 3 letras, sin espacios)" }, { status: 400 });

  // Check slug availability
  const existing = masterDb.prepare("SELECT id FROM companies WHERE slug=?").get(slug);
  if (existing) return NextResponse.json({ error: "Ese identificador ya está en uso. Elige otro." }, { status: 409 });

  try {
    // Create company in pending status
    const company = createCompany({
      slug, name: body.company_name, email: body.email,
      phone: body.phone, nit: body.nit,
      plan_id: body.plan_id || undefined,
      status: "pending",
    });

    // Init company DB and create admin user
    const db = getCompanyDb(slug);
    const { hash, salt } = hashPassword(body.admin_password);
    db.prepare(
      "INSERT OR IGNORE INTO users (username, name, password_hash, salt, permissions, is_admin, email) VALUES (?,?,?,?,?,1,?)"
    ).run(
      sanitizeInput(body.admin_username),
      body.company_name,
      hash, salt,
      JSON.stringify({ chat:true, crm:true, calendar:true, products:true, settings:true }),
      body.email
    );

    // Set company config
    db.prepare("UPDATE company_config SET name=?, email=?, phone=? WHERE id=1")
      .run(body.company_name, body.email, body.phone ?? null);

    // Notify master via token (stored for dashboard pickup)
    const notifToken = crypto.randomBytes(8).toString("hex");
    masterDb.prepare(`
      INSERT INTO subscriptions (company_id, plan_id, billing_cycle, status, notes)
      VALUES (?, ?, 'monthly', 'pending', ?)
    `).run(company.id, body.plan_id || 1, `Auto-registro: ${body.email} — token: ${notifToken}`);

    return NextResponse.json({
      ok: true,
      company_name: body.company_name,
      slug,
      message: "Registro exitoso. Tu cuenta está pendiente de activación. Recibirás un correo cuando esté lista.",
    }, { status: 201 });

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
