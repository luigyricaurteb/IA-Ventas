export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

// LIDs de WhatsApp son números de 14+ dígitos que no corresponden a teléfonos reales
const LID_PHONE_REGEX = /^\d{14,}$/;

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const all = db.prepare("SELECT id, phone, name FROM conversations").all() as { id: number; phone: string; name: string | null }[];
  const lids = all.filter(c => LID_PHONE_REGEX.test(c.phone));
  return NextResponse.json({ lid_conversations: lids.length, sample: lids.slice(0, 10) });
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // Encontrar conversaciones con LID (14+ dígitos puramente numéricos)
  const all = db.prepare("SELECT id, phone, name FROM conversations").all() as { id: number; phone: string; name: string | null }[];
  const lids = all.filter(c => LID_PHONE_REGEX.test(c.phone));

  let fixed = 0;
  let removed = 0;

  for (const conv of lids) {
    // Contar mensajes para no eliminar conversaciones con historial
    const msgCount = (db.prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id=?").get(conv.id) as { c: number }).c;

    if (msgCount === 0) {
      // Sin historial → eliminar la conversación vacía
      db.prepare("DELETE FROM bot_conversation_state WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM contacts WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM crm_deals WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM conversations WHERE id=?").run(conv.id);
      removed++;
    } else {
      // Con historial → marcar con nombre "Contacto pendiente" si no tiene nombre
      if (!conv.name) {
        db.prepare("UPDATE conversations SET name=? WHERE id=?").run(`Contacto ${conv.phone.slice(-6)}`, conv.id);
        fixed++;
      }
    }
  }

  return NextResponse.json({ ok: true, lids_found: lids.length, removed_empty: removed, marked_pending: fixed });
}
