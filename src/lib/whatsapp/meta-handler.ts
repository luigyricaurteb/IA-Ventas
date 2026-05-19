/**
 * Handler de mensajes entrantes — WhatsApp Cloud API (Meta)
 * Equivalente a src/lib/baileys/handler.ts pero sin dependencias de Baileys.
 * Toda la lógica de negocio (IA, CRM, bot) se reutiliza exactamente igual.
 */
import type { MetaMessage } from "./meta-api";
import { sendText, markAsRead, extractText } from "./meta-api";
import { processBotMessage } from "../bot/state-machine";
import { sendAlert } from "../email";

const HUMAN_RESUME_SECS = 5 * 60;

export async function handleMetaMessage(
  db: import("better-sqlite3").Database,
  slug: string,
  msg: MetaMessage,
  pushName?: string
): Promise<void> {
  try {
    const phone = msg.from.replace(/\D/g, "");
    const now   = Math.floor(Date.now() / 1000);

    // Marcar como leído en WhatsApp
    markAsRead(db, msg.id).catch(() => {});

    // Deduplicar: ignorar si ya procesamos este mensaje
    const already = db.prepare(
      "SELECT id FROM messages WHERE wa_message_id=? LIMIT 1"
    ).get(msg.id) as { id: number } | null;
    if (already) return;

    // Crear / actualizar conversación
    let conv = db.prepare(
      "SELECT id, phone, mode, name, human_took_over_at FROM conversations WHERE phone=?"
    ).get(phone) as { id: number; phone: string; mode: string; name: string | null; human_took_over_at: number | null } | null;

    const isNewConv = !conv;
    if (!conv) {
      conv = db.prepare(
        "INSERT INTO conversations (phone, name) VALUES (?,?) RETURNING id, phone, mode, name, human_took_over_at"
      ).get(phone, pushName ?? null) as typeof conv;
    } else if (pushName && !conv.name) {
      db.prepare("UPDATE conversations SET name=? WHERE id=?").run(pushName, conv.id);
      conv = { ...conv, name: pushName };
    }

    if (!conv) return;

    // Extraer texto / contenido del mensaje
    const text = extractText(msg);
    if (!text) {
      console.log(`[meta:${slug}] Mensaje sin contenido reconocido — tipo: ${msg.type}`);
      return;
    }

    console.log(`[meta:${slug}] ← ${phone} (${pushName ?? "sin nombre"}): "${text.slice(0, 80)}"`);

    // Guardar mensaje
    db.prepare(
      "INSERT INTO messages (conversation_id, role, content, wa_message_id, created_at) VALUES (?,?,?,?,?)"
    ).run(conv.id, "user", text, msg.id, parseInt(msg.timestamp));

    // Actualizar last_message_at
    db.prepare("UPDATE conversations SET last_message_at=? WHERE id=?").run(now, conv.id);

    // Alerta de email si es conversación nueva o lleva 1h+ inactiva
    const lastMsgAt = (db.prepare("SELECT last_message_at FROM conversations WHERE id=?")
      .get(conv.id) as { last_message_at: number | null } | null)?.last_message_at ?? 0;
    const idleSecs  = now - lastMsgAt;
    if (isNewConv || idleSecs > 3600) {
      sendAlert(db, "new_conversation", {
        phone: `+${phone}`,
        name: conv.name ?? pushName ?? null,
        time: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
        preview: text.slice(0, 120),
      }).catch(() => {});
    }

    // Verificar modo y auto-reactivación de IA tras 5 min sin respuesta humana
    const freshConv = db.prepare(
      "SELECT mode, human_took_over_at FROM conversations WHERE id=?"
    ).get(conv.id) as { mode: string; human_took_over_at: number | null } | null;

    if (freshConv?.mode !== "AI") {
      const elapsed = now - (freshConv?.human_took_over_at ?? 0);
      if (elapsed < HUMAN_RESUME_SECS) {
        console.log(`[meta:${slug}] Modo HUMAN activo para ${phone} — ${Math.ceil((HUMAN_RESUME_SECS - elapsed) / 60)} min restantes`);
        return;
      }
      db.prepare("UPDATE conversations SET mode='AI', human_took_over_at=NULL WHERE id=?").run(conv.id);
      console.log(`[meta:${slug}] ⏱ Auto-reactivando IA para ${phone}`);
    }

    // Historial para la IA
    const history = db.prepare(
      "SELECT role, content FROM messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at ASC LIMIT 30"
    ).all(conv.id) as { role: string; content: string }[];

    // Adaptador de envío: processBotMessage espera una función de envío compatible con Baileys sock.
    // Creamos un "sock simulado" que usa la Meta API.
    const metaSock = createMetaSock(db, phone);
    await processBotMessage(metaSock as never, conv.id, phone, `${phone}@s.whatsapp.net`, text, history, slug, pushName);

  } catch (err) {
    console.error(`[meta:${slug}] Error en handleMetaMessage:`, err);
  }
}

// Adaptador: simula la interfaz de sock de Baileys para que processBotMessage funcione
// sin ningún cambio en la lógica del bot.
function createMetaSock(db: import("better-sqlite3").Database, phone: string) {
  return {
    sendMessage: async (jid: string, content: Record<string, unknown>) => {
      const target = jid.replace("@s.whatsapp.net", "").replace("@lid", "");
      if (content.text) {
        await sendText(db, target, String(content.text));
      }
      // Image sending via Meta is handled separately in sendProductImages
    },
    user: { id: `${phone}@s.whatsapp.net` },
    ev: { emit: () => {}, on: () => {}, off: () => {} },
    // Flags for Meta-specific handling
    _isMeta: true,
    _db: db,
    _phone: phone,
  };
}
