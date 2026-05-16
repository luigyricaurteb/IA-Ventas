import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getCompanyBySlug } from "@/lib/master/db-master";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    slug?: string; name?: string; phone?: string;
    email?: string; interest?: string; message?: string;
  };

  const { slug, name, phone, email, interest, message } = body;

  if (!slug || !name || !phone) {
    return NextResponse.json({ error: "Nombre, teléfono y empresa requeridos" }, { status: 400 });
  }

  const company = getCompanyBySlug(slug);
  if (!company || company.status === "suspended") {
    return NextResponse.json({ error: "Empresa no disponible" }, { status: 404 });
  }

  const db = getCompanyDb(slug);

  // Limpiar teléfono (solo dígitos, agregar código Colombia si falta)
  const cleanPhone = phone.replace(/\D/g, "");
  const waPhone = cleanPhone.startsWith("57") ? cleanPhone : `57${cleanPhone}`;

  // Crear o actualizar conversación
  const conv = db.prepare(
    "INSERT INTO conversations (phone, name) VALUES (?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name RETURNING *"
  ).get(waPhone, name) as { id: number; phone: string };

  // Crear contacto CRM
  const existing = db.prepare("SELECT id FROM contacts WHERE conversation_id=?").get(conv.id) as { id: number } | null;
  if (!existing) {
    db.prepare("INSERT INTO contacts (conversation_id, full_name, email, interest) VALUES (?,?,?,?)").run(conv.id, name, email ?? null, interest ?? null);
  } else {
    db.prepare("UPDATE contacts SET full_name=?, email=?, interest=? WHERE conversation_id=?").run(name, email ?? null, interest ?? null, conv.id);
  }

  // Guardar mensaje inicial si lo hay
  if (message?.trim()) {
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?,?,?)").run(conv.id, "user", message.trim());
    db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conv.id);
  }

  // Enqueue mensaje de bienvenida desde la empresa
  const config = db.prepare("SELECT ai_name FROM company_config WHERE id=1").get() as { ai_name: string | null } | null;
  const aiName = config?.ai_name ?? "nuestro equipo";
  db.prepare("INSERT INTO outbox (conversation_id, phone, content) VALUES (?,?,?)").run(
    conv.id, waPhone,
    `¡Hola ${name}! Gracias por contactarnos. ${aiName} te atenderá pronto por este medio. ¿En qué podemos ayudarte?`
  );

  return NextResponse.json({ ok: true, message: "Formulario enviado. Te contactaremos pronto por WhatsApp." });
}
