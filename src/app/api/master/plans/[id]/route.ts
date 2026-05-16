export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { upsertPlan, getPlanById } from "@/lib/master/db-master";

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me || me.role !== "master") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  const plan = getPlanById(Number(id));
  if (!plan) return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });

  const updated = upsertPlan({
    id: Number(id),
    name:           (body.name as string)           ?? plan.name,
    description:    (body.description as string)    ?? plan.description ?? undefined,
    price_monthly:  (body.price_monthly as number)  ?? plan.price_monthly,
    billing_cycle:  (body.billing_cycle as string)  ?? plan.billing_cycle,
    modules:        (body.modules as string)        ?? plan.modules,
    max_users:      (body.max_users as number)      ?? plan.max_users,
    max_wa_numbers: (body.max_wa_numbers as number) ?? plan.max_wa_numbers,
    active:         body.active !== undefined ? (body.active ? 1 : 0) : plan.active,
  });
  return NextResponse.json({ plan: updated });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me || me.role !== "master") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { id } = await params;
  // Marcar inactivo en lugar de eliminar físicamente
  upsertPlan({ id: Number(id), name: "", active: 0 });
  return NextResponse.json({ ok: true });
}
