import { NextRequest, NextResponse } from "next/server";
import { listCompanies, createCompany, getPlanById } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken, hashPassword, sanitizeInput } from "@/lib/auth";

export const dynamic = "force-dynamic";

function requireMaster(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value ?? "";
  const auth  = getUserFromToken(token);
  return auth?.role === "master";
}

export async function GET(req: NextRequest) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  return NextResponse.json({ companies: listCompanies() });
}

export async function POST(req: NextRequest) {
  if (!requireMaster(req)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const body = await req.json() as {
    name?: string; slug?: string; nit?: string; email?: string; phone?: string; address?: string;
    plan_id?: number; status?: string;
    admin_username?: string; admin_name?: string; admin_password?: string;
  };

  if (!body.name || !body.slug) return NextResponse.json({ error: "Nombre y slug requeridos" }, { status: 400 });
  if (!body.admin_username || !body.admin_password) return NextResponse.json({ error: "Usuario y contraseña del admin requeridos" }, { status: 400 });

  const slug = String(body.slug).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50);
  if (!slug) return NextResponse.json({ error: "Slug inválido" }, { status: 400 });

  try {
    const company = createCompany({
      slug, name: body.name, nit: body.nit, email: body.email,
      phone: body.phone, address: body.address,
      plan_id: body.plan_id ?? undefined,
      status: body.status ?? "active",
    });

    // Inicializar DB de empresa y crear usuario admin
    const db = getCompanyDb(slug);

    // Determinar módulos permitidos por el plan
    const plan = body.plan_id ? getPlanById(body.plan_id) : null;
    const planModules: Record<string, boolean> = plan
      ? JSON.parse(plan.modules || "{}") as Record<string, boolean>
      : { chat:true, crm:true, calendar:true, accounting:true, suppliers:true, products:true, campaigns:true, documents:true, analytics:true, settings:true };

    // Crear admin con todos los módulos del plan activos
    const { hash, salt } = hashPassword(body.admin_password);
    db.prepare(
      "INSERT OR IGNORE INTO users (username, name, password_hash, salt, permissions, is_admin) VALUES (?,?,?,?,?,1)"
    ).run(
      sanitizeInput(body.admin_username),
      body.admin_name || body.name,
      hash, salt,
      JSON.stringify(planModules)
    );

    // Configurar nombre de empresa en company_config
    db.prepare("UPDATE company_config SET name=?, email=?, phone=? WHERE id=1")
      .run(body.name, body.email ?? null, body.phone ?? null);

    return NextResponse.json({ company }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error al crear empresa";
    return NextResponse.json({ error: msg.includes("UNIQUE") ? "El slug ya existe" : msg }, { status: 400 });
  }
}
