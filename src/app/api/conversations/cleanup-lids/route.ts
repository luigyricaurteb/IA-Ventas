export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

// LIDs de WhatsApp son números internos muy largos (≥14 dígitos).
// Teléfonos reales en formato E.164 sin + son máximo 13 dígitos (ej: 573001234567 = 12 dígitos).
const LID_PHONE_REGEX = /^\d{14,}$/;

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // Encontrar conversaciones con números LID (14+ dígitos)
  const lidConvs = db.prepare(
    "SELECT id, phone, name FROM conversations WHERE LENGTH(phone) >= 14 AND phone GLOB '*[0-9]*'"
  ).all() as { id: number; phone: string; name: string | null }[];

  // Filtrar solo los que realmente parecen LIDs (puramente numéricos y muy largos)
  const toDelete = lidConvs.filter(c => LID_PHONE_REGEX.test(c.phone));

  let deleted = 0;
  for (const conv of toDelete) {
    try {
      // Eliminar mensajes asociados
      db.prepare("DELETE FROM messages WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM bot_conversation_state WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM contacts WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM payment_proofs WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM outbox WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM crm_deals WHERE conversation_id=?").run(conv.id);
      db.prepare("DELETE FROM conversations WHERE id=?").run(conv.id);
      deleted++;
    } catch {}
  }

  return NextResponse.json({
    ok: true,
    found: lidConvs.length,
    deleted,
    sample: toDelete.slice(0, 5).map(c => ({ phone: c.phone, name: c.name })),
  });
}

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const lidConvs = db.prepare(
    "SELECT id, phone, name FROM conversations WHERE LENGTH(phone) >= 14 AND phone GLOB '*[0-9]*'"
  ).all() as { id: number; phone: string; name: string | null }[];

  const lids = lidConvs.filter(c => LID_PHONE_REGEX.test(c.phone));

  return NextResponse.json({
    lid_conversations: lids.length,
    sample: lids.slice(0, 10).map(c => ({ phone: c.phone, name: c.name })),
  });
}
