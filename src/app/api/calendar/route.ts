import { NextRequest, NextResponse } from "next/server";
import {
  listReservationsByMonth, listReservationsPaginated,
  insertReservation, getReservationCountByDay,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view   = searchParams.get("view") ?? "month";
  const year   = Number(searchParams.get("year")  ?? new Date().getFullYear());
  const month  = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const status = searchParams.get("status") ?? null;
  const page   = Number(searchParams.get("page") ?? 0);

  if (view === "month") {
    const reservations = listReservationsByMonth(year, month);
    const countByDay   = getReservationCountByDay(year, month);
    return NextResponse.json({ reservations, countByDay });
  }

  if (view === "list") {
    const { rows, total } = listReservationsPaginated(status, page, 50);
    return NextResponse.json({ rows, total, page });
  }

  return NextResponse.json({ error: "view inválido" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.service_date) {
    return NextResponse.json({ error: "Fecha requerida" }, { status: 400 });
  }
  const reservation = insertReservation({
    deal_id:      body.deal_id      ?? null,
    contact_id:   body.contact_id   ?? null,
    client_name:  body.client_name  ?? null,
    service_name: body.service_name ?? null,
    service_date: Number(body.service_date),
    people_count: Number(body.people_count ?? 1),
    total_value:  body.total_value  ? Number(body.total_value) : null,
    status:       body.status       ?? "pending",
    notes:        body.notes        ?? null,
  });
  return NextResponse.json({ reservation }, { status: 201 });
}
