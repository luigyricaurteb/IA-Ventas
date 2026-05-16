import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Escanea deals GANADOS que no tienen reserva y las crea automáticamente
export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const orphans = db.prepare(`
    SELECT d.id, d.contact_id, d.product_id, d.people_count, d.total_value,
           c.full_name, c.travel_date, c.email,
           p.name as product_name, conv.phone
    FROM crm_deals d
    LEFT JOIN contacts c ON d.contact_id = c.id
    LEFT JOIN products p ON d.product_id = p.id
    LEFT JOIN conversations conv ON d.conversation_id = conv.id
    WHERE d.stage = 'GANADO'
      AND d.id NOT IN (SELECT deal_id FROM reservations WHERE deal_id IS NOT NULL)
  `).all() as {
    id: number; contact_id: number | null; product_id: number | null;
    people_count: number | null; total_value: number | null;
    full_name: string | null; travel_date: string | null;
    product_name: string | null; phone: string | null;
  }[];

  const created: number[] = [];

  for (const deal of orphans) {
    let serviceDate = Math.floor(Date.now() / 1000) + 86400;
    if (deal.travel_date) {
      const parsed = Date.parse(deal.travel_date);
      if (!isNaN(parsed)) serviceDate = Math.floor(parsed / 1000);
    }

    const code = `RES-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const res = db.prepare(`
      INSERT INTO reservations
        (deal_id, contact_id, reservation_code, client_name, service_name,
         service_date, people_count, total_value, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
      RETURNING id
    `).get(
      deal.id,
      deal.contact_id,
      code,
      deal.full_name ?? deal.phone ?? "Cliente",
      deal.product_name ?? "Servicio DMC",
      serviceDate,
      deal.people_count ?? 1,
      deal.total_value,
      deal.travel_date ? `Fecha solicitada: ${deal.travel_date}` : null,
    ) as { id: number };

    created.push(res.id);
  }

  return NextResponse.json({ created: created.length, ids: created });
}
