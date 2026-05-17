export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  // 1. Actualizar nombres de conversaciones desde contactos
  const convResult = db.prepare(`
    UPDATE conversations
    SET name = (
      SELECT full_name FROM contacts
      WHERE conversation_id = conversations.id
        AND full_name IS NOT NULL AND full_name != ''
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM contacts
      WHERE conversation_id = conversations.id
        AND full_name IS NOT NULL AND full_name != ''
    )
  `).run();

  // 2. Asignar contact_id a deals que no lo tienen
  const dealResult = db.prepare(`
    UPDATE crm_deals
    SET contact_id = (
      SELECT id FROM contacts
      WHERE conversation_id = crm_deals.conversation_id
      LIMIT 1
    )
    WHERE contact_id IS NULL
      AND conversation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM contacts WHERE conversation_id = crm_deals.conversation_id
      )
  `).run();

  // 3. Crear contacto para conversaciones que tienen nombre pero no contacto
  const convWithName = db.prepare(`
    SELECT id, name FROM conversations
    WHERE name IS NOT NULL AND name != ''
      AND NOT EXISTS (SELECT 1 FROM contacts WHERE conversation_id = conversations.id)
  `).all() as { id: number; name: string }[];

  let contactsCreated = 0;
  for (const conv of convWithName) {
    db.prepare("INSERT OR IGNORE INTO contacts (conversation_id, full_name) VALUES (?,?)").run(conv.id, conv.name);
    contactsCreated++;
  }

  // 4. Re-asignar contact_id después de crear los contactos nuevos
  db.prepare(`
    UPDATE crm_deals
    SET contact_id = (
      SELECT id FROM contacts WHERE conversation_id = crm_deals.conversation_id LIMIT 1
    )
    WHERE contact_id IS NULL AND conversation_id IS NOT NULL
  `).run();

  return NextResponse.json({
    ok: true,
    conversations_updated: convResult.changes,
    deals_updated: dealResult.changes,
    contacts_created: contactsCreated,
  });
}
