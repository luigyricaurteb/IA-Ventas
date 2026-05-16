import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
interface Ctx { params: Promise<{ conversationId: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const id = Number(conversationId);
  const db = getCompanyDb(me.company ?? "platform");

  const conv = db.prepare("SELECT phone FROM conversations WHERE id=?").get(id) as { phone: string } | null;
  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  // Registrar el envío de CSAT en la tabla
  db.prepare("INSERT OR IGNORE INTO csat_scores (conversation_id) VALUES (?)").run(id);

  // Encolar mensaje de encuesta en el outbox para enviarlo por WhatsApp
  const msg = "¡Gracias por contactarnos! ¿Cómo calificarías la atención recibida?\nResponde del 1 al 5:\n1 - Muy mala\n2 - Mala\n3 - Regular\n4 - Buena\n5 - Excelente";
  db.prepare("INSERT INTO outbox (conversation_id, phone, content) VALUES (?,?,?)").run(id, conv.phone, msg);

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { conversationId } = await params;
  const db = getCompanyDb(me.company ?? "platform");
  const scores = db.prepare("SELECT * FROM csat_scores WHERE conversation_id=? ORDER BY sent_at DESC").all(Number(conversationId));
  return NextResponse.json({ scores });
}
