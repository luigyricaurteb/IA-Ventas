export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import masterDb, { createCompany, listPlans } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { hashPassword, sanitizeInput } from "@/lib/auth";
import { sendRegistrationReceivedEmail } from "@/lib/master/email-master";
import crypto from "node:crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL
  ?? (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : "https://aivoxgroup.com");

export async function GET() {
  const plans = listPlans().filter(p => p.active && p.price_monthly > 0);

  // Verificar si Wompi está activo y tiene claves configuradas
  const gw = masterDb.prepare("SELECT wompi_public_key, wompi_active FROM gateway_config WHERE id=1").get() as {
    wompi_public_key: string | null; wompi_active: number;
  } | null;
  const wompiActive = gw?.wompi_active === 1 && Boolean(gw?.wompi_public_key);

  // Cuentas bancarias del master para transferencias
  const platformDb = getCompanyDb("platform");
  const banks = platformDb.prepare(
    "SELECT bank_name, account_type, account_number, account_holder FROM bank_accounts WHERE active=1"
  ).all() as { bank_name: string; account_type: string; account_number: string; account_holder: string | null }[];
  const platformCfg = platformDb.prepare("SELECT nequi_phone, daviplata_phone, email FROM company_config WHERE id=1").get() as {
    nequi_phone: string | null; daviplata_phone: string | null; email: string | null;
  } | null;

  return NextResponse.json({
    plans,
    wompi_active: wompiActive,
    wompi_public_key: wompiActive ? gw?.wompi_public_key : null,
    banks,
    nequi_phone: platformCfg?.nequi_phone ?? null,
    daviplata_phone: platformCfg?.daviplata_phone ?? null,
  });
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

  const existing = masterDb.prepare("SELECT id FROM companies WHERE slug=?").get(slug);
  if (existing) return NextResponse.json({ error: "Ese identificador ya está en uso. Elige otro." }, { status: 409 });

  try {
    const company = createCompany({
      slug, name: body.company_name, email: body.email,
      phone: body.phone, nit: body.nit,
      plan_id: body.plan_id || undefined,
      status: "pending",
    });

    const db = getCompanyDb(slug);
    const { hash, salt } = hashPassword(body.admin_password);
    db.prepare(
      "INSERT OR IGNORE INTO users (username, name, password_hash, salt, permissions, is_admin, email) VALUES (?,?,?,?,?,1,?)"
    ).run(
      sanitizeInput(body.admin_username), body.company_name, hash, salt,
      JSON.stringify({ chat:true, crm:true, calendar:true, products:true, settings:true }),
      body.email
    );
    db.prepare("UPDATE company_config SET name=?, email=?, phone=? WHERE id=1")
      .run(body.company_name, body.email, body.phone ?? null);

    // Obtener nombre del plan
    const plan = masterDb.prepare("SELECT name, price_monthly FROM plans WHERE id=?").get(body.plan_id) as {
      name: string; price_monthly: number;
    } | null;

    // Wompi: generar referencia única e integridad hash
    const gw = masterDb.prepare("SELECT wompi_public_key, wompi_private_key, wompi_active FROM gateway_config WHERE id=1").get() as {
      wompi_public_key: string | null; wompi_private_key: string | null; wompi_active: number;
    } | null;
    const wompiActive = gw?.wompi_active === 1 && Boolean(gw?.wompi_public_key) && Boolean(gw?.wompi_private_key);

    let wompiData: { reference: string; integrity: string; amount_in_cents: number; redirect_url: string } | null = null;

    if (wompiActive && plan && plan.price_monthly > 0) {
      const reference = `AIVOX-${slug}-${Date.now()}`;
      const amountCents = Math.round(plan.price_monthly * 100); // COP en centavos
      const redirectUrl = `${APP_URL}/register/payment-success`;
      const integrityStr = `${reference}${amountCents}COP${gw!.wompi_private_key!}`;
      const integrity = crypto.createHash("sha256").update(integrityStr).digest("hex");

      wompiData = { reference, integrity, amount_in_cents: amountCents, redirect_url: redirectUrl };

      // Guardar suscripción con referencia Wompi
      masterDb.prepare(
        "INSERT INTO subscriptions (company_id, plan_id, billing_cycle, status, payment_method, payment_reference, payment_amount, notes) VALUES (?,?,?,?,?,?,?,?)"
      ).run(company.id, body.plan_id || 1, "monthly", "pending", "card", reference, plan.price_monthly, `Registro web — ${body.email}`);
    } else {
      // Transferencia manual
      masterDb.prepare(
        "INSERT INTO subscriptions (company_id, plan_id, billing_cycle, status, payment_method, payment_amount, notes) VALUES (?,?,?,?,?,?,?)"
      ).run(company.id, body.plan_id || 1, "monthly", "pending", "transfer", plan?.price_monthly ?? 0, `Registro web — ${body.email}`);
    }

    // Email de confirmación al cliente (en background, no bloqueante)
    if (plan) {
      sendRegistrationReceivedEmail({
        to: body.email,
        companyName: body.company_name,
        plan: plan.name,
        paymentMethod: wompiActive ? "card" : "transfer",
      }).catch(e => console.warn("[register] email cliente:", (e as Error).message));
    }

    return NextResponse.json({
      ok: true,
      company_name: body.company_name,
      slug,
      company_id: company.id,
      wompi: wompiData,
      wompi_public_key: wompiActive ? gw?.wompi_public_key : null,
      plan_name: plan?.name ?? "",
      plan_amount: plan?.price_monthly ?? 0,
    }, { status: 201 });

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
