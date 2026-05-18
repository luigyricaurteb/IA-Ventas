import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function escapeIcal(s: string): string {
  return s.replace(/[\\;,]/g, "\\$&").replace(/\n/g, "\\n");
}

function formatDt(ts: number): string {
  return new Date(ts * 1000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export async function GET(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = getCompanyDb(me.company ?? "platform");
  const reservations = db.prepare(
    "SELECT * FROM reservations WHERE status IN ('pending','confirmed') ORDER BY service_date ASC"
  ).all() as { id: number; client_name: string | null; service_name: string | null; service_date: number; people_count: number; total_value: number | null; status: string; notes: string | null; reservation_code: string | null }[];

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hivo//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Reservas",
    "X-WR-TIMEZONE:America/Bogota",
  ];

  for (const r of reservations) {
    const start = formatDt(r.service_date);
    const end   = formatDt(r.service_date + 3600); // 1h por defecto
    const title = `${r.service_name ?? "Servicio"} — ${r.client_name ?? "Cliente"}`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:reservation-${r.id}@agente-dmc`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${escapeIcal(title)}`);
    if (r.reservation_code) lines.push(`DESCRIPTION:Código: ${r.reservation_code}\\nPax: ${r.people_count}${r.notes ? `\\n${escapeIcal(r.notes)}` : ""}`);
    lines.push(`STATUS:${r.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="reservas.ics"',
      "Cache-Control": "no-cache",
    },
  });
}
