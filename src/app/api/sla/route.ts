import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = getCompanyDb(me.company ?? "platform");

  const sla = db.prepare("SELECT response_time_minutes FROM sla_config WHERE id=1").get() as { response_time_minutes: number } | null;
  const minutes = sla?.response_time_minutes ?? 30;
  const cutoff = Math.floor(Date.now() / 1000) - minutes * 60;

  // Conversaciones en modo HUMAN con último mensaje de usuario más antiguo que el límite SLA
  const breaches = db.prepare(`
    SELECT c.id, c.phone, c.name,
      (SELECT content FROM messages WHERE conversation_id=c.id AND role='user' ORDER BY created_at DESC LIMIT 1) as last_user_msg,
      (SELECT created_at FROM messages WHERE conversation_id=c.id AND role='user' ORDER BY created_at DESC LIMIT 1) as last_user_at,
      (SELECT created_at FROM messages WHERE conversation_id=c.id AND role IN ('human','assistant') ORDER BY created_at DESC LIMIT 1) as last_agent_at
    FROM conversations c
    WHERE c.mode='HUMAN'
      AND c.last_message_at IS NOT NULL
      AND (
        SELECT created_at FROM messages WHERE conversation_id=c.id AND role='user' ORDER BY created_at DESC LIMIT 1
      ) < ?
      AND (
        (SELECT created_at FROM messages WHERE conversation_id=c.id AND role IN ('human','assistant') ORDER BY created_at DESC LIMIT 1) IS NULL
        OR (
          (SELECT created_at FROM messages WHERE conversation_id=c.id AND role='user' ORDER BY created_at DESC LIMIT 1) >
          (SELECT created_at FROM messages WHERE conversation_id=c.id AND role IN ('human','assistant') ORDER BY created_at DESC LIMIT 1)
        )
      )
  `).all(cutoff) as { id: number; phone: string; name: string | null; last_user_msg: string; last_user_at: number; last_agent_at: number | null }[];

  return NextResponse.json({ breaches, sla_minutes: minutes });
}

export async function POST(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me || (!me.is_admin && me.role !== "master")) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { minutes } = await req.json() as { minutes?: number };
  if (!minutes || minutes < 1) return NextResponse.json({ error: "Minutos inválidos" }, { status: 400 });

  const db = getCompanyDb(me.company ?? "platform");
  db.prepare("UPDATE sla_config SET response_time_minutes=? WHERE id=1").run(minutes);
  return NextResponse.json({ ok: true, minutes });
}
