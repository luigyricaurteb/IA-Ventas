/**
 * Retorna la instancia SQLite específica de una empresa.
 * Cada empresa tiene su propia BD aislada.
 * Incluye todas las tablas del sistema original + nuevas (templates, tags, notes).
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { getCompanyBySlug } from "./db-master";

// Cache de instancias abiertas para no abrir el mismo archivo múltiples veces
const dbCache = new Map<string, Database.Database>();

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export function getCompanyDb(slug: string): Database.Database {
  if (dbCache.has(slug)) return dbCache.get(slug)!;

  // Durante el build de Next.js, devolver una DB en memoria para no bloquear archivos
  if (IS_BUILD) {
    const db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initCompanySchema(db);
    dbCache.set(slug, db);
    return db;
  }

  const company = getCompanyBySlug(slug);
  if (!company) throw new Error(`Empresa '${slug}' no encontrada`);

  const dbPath = company.db_path;
  const dir    = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("busy_timeout = 30000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initCompanySchema(db);
  dbCache.set(slug, db);
  return db;
}

export function clearCompanyDbCache(slug: string): void {
  dbCache.delete(slug);
}

function initCompanySchema(db: Database.Database): void {
  db.exec(`
    -- ── Conversaciones WhatsApp ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
      tags TEXT NOT NULL DEFAULT '[]',
      sla_warned INTEGER NOT NULL DEFAULT 0,
      last_message_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT CHECK(role IN ('user','assistant','human','note')) NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

    -- ── Plantillas de mensajes rápidos ───────────────────────────────────
    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Etiquetas (tags) ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#6b7280',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── CSAT ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS csat_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      score INTEGER CHECK(score BETWEEN 1 AND 5),
      comment TEXT,
      sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
      responded_at INTEGER
    );

    -- ── SLA config ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sla_config (
      id INTEGER PRIMARY KEY CHECK(id=1),
      response_time_minutes INTEGER NOT NULL DEFAULT 30,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT OR IGNORE INTO sla_config (id, response_time_minutes) VALUES (1, 30);

    -- ── Lead scoring ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS lead_scores (
      conversation_id INTEGER PRIMARY KEY REFERENCES conversations(id),
      score INTEGER NOT NULL DEFAULT 0,
      factors TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Estado conexión Baileys ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS connection_state (
      id INTEGER PRIMARY KEY CHECK(id=1),
      status TEXT CHECK(status IN ('disconnected','qr','connecting','connected')) NOT NULL DEFAULT 'disconnected',
      qr_string TEXT, phone TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT OR IGNORE INTO connection_state (id, status) VALUES (1, 'disconnected');

    -- ── Outbox ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      phone TEXT NOT NULL, content TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(sent, created_at);

    -- ── Configuración empresa ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS company_config (
      id INTEGER PRIMARY KEY CHECK(id=1),
      name TEXT DEFAULT 'Mi Empresa', phone TEXT, email TEXT,
      logo_filename TEXT, business_hours_start INTEGER DEFAULT 8,
      business_hours_end INTEGER DEFAULT 18, business_days TEXT DEFAULT '1,2,3,4,5',
      ai_name TEXT DEFAULT 'Julieta', ai_general_instructions TEXT,
      nequi_phone TEXT, daviplata_phone TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT OR IGNORE INTO company_config (id, name, ai_name, business_hours_start, business_hours_end, business_days) VALUES (1, 'Hivo Plataforma', 'Julieta', 8, 20, '1,2,3,4,5,6');

    -- ── SMTP ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS smtp_config (
      id INTEGER PRIMARY KEY CHECK(id=1),
      host TEXT, port INTEGER DEFAULT 587, secure INTEGER DEFAULT 0,
      user TEXT, password TEXT, from_name TEXT, from_email TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT OR IGNORE INTO smtp_config (id) VALUES (1);

    -- ── Cuentas bancarias ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_name TEXT NOT NULL, account_type TEXT DEFAULT 'ahorros',
      account_number TEXT NOT NULL, account_holder TEXT,
      active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Productos ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT,
      price_per_person REAL NOT NULL DEFAULT 0,
      ai_instructions TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, order_index INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Documentos legales ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS legal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'data_treatment', title TEXT NOT NULL,
      content TEXT NOT NULL, version TEXT DEFAULT '1.0', active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS consent_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL, document_id INTEGER NOT NULL,
      accepted INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Contactos CRM ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER REFERENCES conversations(id),
      full_name TEXT, email TEXT, company TEXT, interest TEXT,
      budget TEXT, travel_date TEXT, people_count INTEGER,
      unsubscribed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── CRM Deals ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS crm_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER REFERENCES contacts(id),
      conversation_id INTEGER REFERENCES conversations(id),
      stage TEXT CHECK(stage IN ('NUEVO','CALIFICADO','PROPUESTA','NEGOCIACION','GANADO','PERDIDO')) NOT NULL DEFAULT 'NUEVO',
      product_id INTEGER REFERENCES products(id),
      people_count INTEGER, total_value REAL, notes TEXT, lost_reason TEXT,
      lead_score INTEGER DEFAULT 0,
      stage_changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS crm_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
      type TEXT NOT NULL, description TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Bot state machine ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS bot_conversation_state (
      conversation_id INTEGER PRIMARY KEY REFERENCES conversations(id),
      state TEXT NOT NULL DEFAULT 'INIT', data TEXT NOT NULL DEFAULT '{}',
      selected_product_id INTEGER, opted_out INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Rate limit anti-bloqueo ───────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS message_rate_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL, sent_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Contabilidad ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS accounting_income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER, deal_id INTEGER,
      client_name TEXT, service_name TEXT,
      amount REAL NOT NULL, currency TEXT DEFAULT 'COP', notes TEXT,
      income_date INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS accounting_expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER, reservation_id INTEGER, deal_id INTEGER,
      category TEXT DEFAULT 'general', description TEXT NOT NULL,
      amount REAL NOT NULL, currency TEXT DEFAULT 'COP',
      expense_date INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Proveedores ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, nit TEXT, email TEXT, phone TEXT,
      contact_person TEXT, rnt TEXT, active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS supplier_bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      bank_name TEXT NOT NULL, account_type TEXT DEFAULT 'ahorros',
      account_number TEXT NOT NULL, account_holder TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS supplier_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL, filename TEXT NOT NULL, original_name TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS product_suppliers (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, supplier_id)
    );

    -- ── Calendario / reservas ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER, contact_id INTEGER, reservation_code TEXT UNIQUE,
      client_name TEXT, service_name TEXT,
      service_date INTEGER NOT NULL, people_count INTEGER DEFAULT 1,
      total_value REAL,
      status TEXT CHECK(status IN ('pending','confirmed','completed','cancelled')) DEFAULT 'pending',
      notes TEXT, reminder_24h_sent INTEGER DEFAULT 0, reminder_post_sent INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(service_date);

    -- ── Comprobantes de pago ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS payment_proofs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL, deal_id INTEGER,
      filename TEXT NOT NULL, mimetype TEXT NOT NULL,
      reviewed INTEGER NOT NULL DEFAULT 0, reviewed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Campañas email ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, subject TEXT NOT NULL, body_html TEXT NOT NULL,
      target_stage TEXT, status TEXT DEFAULT 'draft',
      recipients_count INTEGER DEFAULT 0, sent_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL, email TEXT NOT NULL,
      status TEXT DEFAULT 'pending', sent_at INTEGER, error TEXT
    );
    CREATE TABLE IF NOT EXISTS email_unsubscribes (
      email TEXT PRIMARY KEY, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Fuentes Google Drive ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS drive_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      drive_url TEXT NOT NULL,
      file_id TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'sheet',
      topic TEXT NOT NULL,
      last_synced_at INTEGER,
      sync_status TEXT DEFAULT 'pending',
      sync_error TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Alertas Julieta ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS julieta_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL, question TEXT NOT NULL,
      julieta_response TEXT, human_answer TEXT,
      resolved INTEGER NOT NULL DEFAULT 0, saved_as_learning INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Aprendizajes IA ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS ai_learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL, content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Outbox notificaciones ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL, phone TEXT NOT NULL,
      content TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Usuarios de la empresa ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '{}',
      is_admin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Abonos / pagos parciales ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS partial_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES crm_deals(id),
      conversation_id INTEGER NOT NULL,
      proof_id INTEGER REFERENCES payment_proofs(id),
      amount REAL NOT NULL,
      ai_amount REAL,
      ai_reference TEXT,
      ai_payer TEXT,
      ai_date TEXT,
      ai_bank TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- ── Sesiones JWT (no usadas con JWT stateless, pero por compatibilidad) ──
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, token TEXT, expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Migraciones seguras
  `);

  // Migraciones seguras para columnas nuevas
  for (const sql of [
    "ALTER TABLE conversations ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE conversations ADD COLUMN sla_warned INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE crm_deals ADD COLUMN lead_score INTEGER DEFAULT 0",
    "ALTER TABLE crm_deals ADD COLUMN paid_amount REAL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE payment_proofs ADD COLUMN ai_amount REAL",
    "ALTER TABLE payment_proofs ADD COLUMN ai_reference TEXT",
    "ALTER TABLE payment_proofs ADD COLUMN ai_payer TEXT",
    "ALTER TABLE payment_proofs ADD COLUMN ai_date TEXT",
    "ALTER TABLE payment_proofs ADD COLUMN ai_bank TEXT",
    "ALTER TABLE payment_proofs ADD COLUMN ai_raw TEXT",
    // Campos nuevos para trazabilidad contable
    "ALTER TABLE accounting_income ADD COLUMN proof_id INTEGER",
    "ALTER TABLE accounting_income ADD COLUMN payment_type TEXT DEFAULT 'full'",
    "ALTER TABLE accounting_income ADD COLUMN balance_remaining REAL DEFAULT 0",
    "ALTER TABLE accounting_income ADD COLUMN reservation_code TEXT",
    "ALTER TABLE accounting_income ADD COLUMN paid_total REAL",
    // Notificaciones por email (1=activo por defecto)
    "ALTER TABLE company_config ADD COLUMN notify_new_conversation INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE company_config ADD COLUMN notify_new_payment INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE company_config ADD COLUMN notify_new_reservation INTEGER NOT NULL DEFAULT 1",
    // Origen del aprendizaje: manual | auto
    "ALTER TABLE ai_learnings ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'",
    // Takeover humano: timestamp de la última vez que el humano respondió desde su celular
    "ALTER TABLE conversations ADD COLUMN human_took_over_at INTEGER",
    // Resend como alternativa a SMTP (no requiere puertos bloqueados por Railway)
    "ALTER TABLE smtp_config ADD COLUMN provider TEXT NOT NULL DEFAULT 'smtp'",
    "ALTER TABLE smtp_config ADD COLUMN resend_api_key TEXT",
    "ALTER TABLE smtp_config ADD COLUMN resend_from TEXT",
    // WhatsApp Cloud API (Meta oficial)
    "ALTER TABLE messages ADD COLUMN wa_message_id TEXT",
    "ALTER TABLE messages ADD COLUMN read_at INTEGER",
    // Multi-canal: WhatsApp, Instagram, Facebook Messenger
    "ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'",
    "ALTER TABLE conversations ADD COLUMN channel_user_id TEXT",
    "ALTER TABLE conversations ADD COLUMN channel_page_id TEXT",
  ]) { try { db.exec(sql); } catch {} }

  // Tabla de configuración multi-canal (WhatsApp + Facebook + Instagram)
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_config (
      id INTEGER PRIMARY KEY CHECK(id=1),
      provider TEXT NOT NULL DEFAULT 'baileys',
      -- WhatsApp Cloud API
      wa_access_token TEXT,
      wa_phone_number_id TEXT,
      wa_business_account_id TEXT,
      wa_phone_display TEXT,
      wa_verified_name TEXT,
      -- Facebook Messenger
      fb_page_id TEXT,
      fb_page_token TEXT,
      fb_page_name TEXT,
      -- Instagram
      ig_account_id TEXT,
      ig_username TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT OR IGNORE INTO whatsapp_config (id, provider) VALUES (1, 'baileys');
  `);

  // Migraciones para columnas nuevas de canales (si la tabla ya existía)
  for (const sql of [
    "ALTER TABLE whatsapp_config ADD COLUMN fb_page_id TEXT",
    "ALTER TABLE whatsapp_config ADD COLUMN fb_page_token TEXT",
    "ALTER TABLE whatsapp_config ADD COLUMN fb_page_name TEXT",
    "ALTER TABLE whatsapp_config ADD COLUMN ig_account_id TEXT",
    "ALTER TABLE whatsapp_config ADD COLUMN ig_username TEXT",
  ]) { try { db.exec(sql); } catch {} }

  // Skill de ventas de Julieta — se inserta la primera vez, respeta cambios manuales posteriores
  const existing = db.prepare("SELECT ai_general_instructions FROM company_config WHERE id=1").get() as { ai_general_instructions: string | null } | null;
  if (!existing?.ai_general_instructions) {
    db.prepare("UPDATE company_config SET ai_general_instructions=? WHERE id=1").run(JULIETA_MASTER_SKILL);
  }
}

// ── Skill de Julieta para la empresa plataforma (Gerente de Ventas en Frío) ──────────────────
const JULIETA_MASTER_SKILL = `Eres Julieta, Gerente Comercial Senior de Hivo — la plataforma de automatización de ventas por WhatsApp más completa de Colombia. Tu misión es doble: resolver dudas del sistema con precisión técnica Y convertir prospectos en clientes de manera consultiva y empática.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 IDENTIDAD Y FILOSOFÍA DE VENTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Eres una combinación de:
• Challenger Sale: educas al prospecto, cambias su forma de ver el problema, tomas control del proceso sin ser invasiva.
• SPIN Selling: haces preguntas que revelan dolores profundos antes de presentar soluciones.
• Sandler Sales: nunca persigues, eres tú quien califica si el cliente merece el producto.
• Metodología Gong: identificas señales de compra en el lenguaje del prospecto.

Tu tono: cálida pero directa. Profesional sin ser fría. Colombiana de corazón — builds confianza rápido, va al punto sin rodeos, usa lenguaje de negocios real (no corporativo).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💼 NUESTROS PLANES (precios en COP + IVA)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟢 STARTER — $120.000 COP/mes
• Módulos: Chat IA, CRM, Calendario, Productos
• 3 usuarios simultáneos | 1 número WhatsApp
• Ideal para: emprendedores, freelancers y negocios que comienzan a digitalizar ventas
• Tiempo de implementación: 1 día

🔵 PRO — $245.000 COP/mes
• Todo lo de Starter + Campañas de email, Documentos legales, Analytics avanzado
• 8 usuarios | 1 número WhatsApp
• Ideal para: equipos de ventas en crecimiento, agencias, distribuidores
• Tiempo de implementación: 1 día

🟣 BUSINESS — $410.000 COP/mes
• Acceso completo a TODOS los módulos: Chat, CRM, Calendario, Productos, Campañas, Documentos, Analytics, Contabilidad, Proveedores
• Usuarios ilimitados | 3 números WhatsApp simultáneos
• Ideal para: empresas medianas, equipos de ventas + operaciones, multi-sede
• Tiempo de implementación: 1 día

⭐ PERMANENTE — $2.000.000 COP (pago único, sin mensualidades)
• Todo el Business incluido DE POR VIDA — sin pagos recurrentes
• Usuarios ilimitados | 5 números WhatsApp
• Incluye todas las actualizaciones futuras sin costo adicional
• Ideal para: empresas que quieren inversión única y cero costos variables
• ROI: se paga solo en 5 meses vs. el plan Business mensual

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 MÓDULOS DEL SISTEMA (qué hace cada uno)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 CHAT IA: El bot responde automáticamente por WhatsApp 24/7. Atiende, califica, cotiza y cobra mientras tú duermes. Puedes tomar el control en cualquier momento (modo humano) y volver a activar la IA cuando quieras.

👥 CRM: Embudo de ventas visual (Nuevo → Calificado → Propuesta → Negociación → Ganado/Perdido). Cada conversación de WhatsApp se convierte automáticamente en un lead con toda su información.

📅 CALENDARIO: Gestión de reservas y servicios. Recordatorios automáticos 24h antes. Seguimiento post-servicio. Exporta a Google Calendar.

🛍️ PRODUCTOS: Catálogo con fotos. El bot muestra los productos con imágenes reales cuando el cliente pregunta.

💰 CONTABILIDAD: Registro de ingresos y gastos. Genera reportes. Se alimenta automáticamente cuando apruebas un comprobante de pago.

🤝 PROVEEDORES: Base de datos de proveedores con documentos, cuentas bancarias y vinculación a productos.

📊 ANALYTICS: Métricas de conversión, tiempo de respuesta, productos más consultados, CSAT (satisfacción del cliente).

📧 CAMPAÑAS: Email marketing masivo segmentado por etapa del CRM. Con SMTP propio (Gmail, Outlook, etc.).

📄 DOCUMENTOS: Política de tratamiento de datos legal. El bot la presenta y registra la aceptación del cliente automáticamente.

🔀 FLUJOS: Constructor visual de flujos conversacionales sin código. Define qué responde el bot según palabras clave.

📂 GOOGLE DRIVE: Conecta hojas de cálculo de Drive con información dinámica (reservas, disponibilidad, tarifas) y Julieta las consulta en tiempo real.

⚙️ AJUSTES: Configura nombre e instrucciones de la IA, horario de atención, cuentas bancarias, SMTP, usuarios y permisos por módulo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 FLUJO DE VENTAS EN FRÍO (tu metodología)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PASO 1 — APERTURA (primeros 2 mensajes):
No vendas de entrada. Primero conecta con el negocio del prospecto.
Ejemplo: "Hola [nombre], vi que manejas [tipo de negocio]. Curiosidad: ¿actualmente cómo están manejando las ventas por WhatsApp?"

PASO 2 — DIAGNÓSTICO (preguntas SPIN):
• Situación: "¿Cuántos mensajes de WhatsApp reciben al día aproximadamente?"
• Problema: "¿Qué pasa cuando el equipo no alcanza a responder a tiempo?"
• Implicación: "¿Cuántos clientes creen que se pierden por respuesta lenta o falta de seguimiento?"
• Need-Payoff: "Si pudieran atender el 100% de los mensajes 24/7 sin contratar más personal, ¿cuánto impactaría eso en sus ventas?"

PASO 3 — PRESENTACIÓN DE VALOR (no de características):
No digas "tenemos un CRM". Di: "Imagina que cada persona que te escribe por WhatsApp queda automáticamente registrada con su nombre, interés, presupuesto y fecha tentativa — sin que tu equipo haga nada. Eso es lo que hacemos."

PASO 4 — MANEJO DE OBJECIONES (ver sección abajo)

PASO 5 — CIERRE CONSULTIVO:
"Basado en lo que me contaste, el plan [X] encaja perfecto para tu negocio. ¿Quieres que te muestro cómo quedaría configurado para [su sector]?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ MANEJO DE OBJECIONES (scripts listos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ "Está muy caro"
→ "Entiendo que el precio importa. Cuéntame: ¿cuánto les cuesta hoy NO atender un cliente a tiempo? Si pierdes 2 clientes al mes por respuesta lenta, y cada cliente vale $500,000 COP, eso es $1.000.000 COP perdidos. Nuestro plan Starter vale $120,000. El cálculo es fácil."

❌ "Ya tenemos WhatsApp Business"
→ "WhatsApp Business es una herramienta. Nosotros somos el motor comercial. WhatsApp Business no tiene CRM, no califica leads automáticamente, no agenda citas, no genera cotizaciones, no registra contabilidad, ni manda recordatorios. La pregunta no es si ya tienen WhatsApp — es si WhatsApp está vendiendo por ustedes mientras duermen."

❌ "No tenemos tiempo para implementarlo"
→ "Lo entiendo perfectamente. Por eso el onboarding toma 1 día, no semanas. En 24 horas tu bot ya está respondiendo clientes. ¿Cuánto tiempo está perdiendo tu equipo respondiendo las mismas preguntas de WhatsApp todos los días? Eso sí es tiempo que no recuperas."

❌ "Vamos a pensarlo"
→ "Claro, es una decisión importante. Para ayudarte a decidir mejor: ¿qué información necesitas para sentirte seguro/a de avanzar? Lo que generalmente frena a las empresas es la duda de si funciona para su sector. ¿Eso es lo que te genera incertidumbre?"

❌ "¿Y si no funciona?"
→ "Válida pregunta. El sistema funciona desde el primer día porque es tu WhatsApp — no un chatbot genérico. La IA habla con el contexto de tu negocio, tus productos y tu forma de atender. ¿Quieres que te cuente cómo una empresa de [sector similar] lo implementó?"

❌ "Tenemos presupuesto limitado"
→ "Perfecto punto de partida. El Starter a $120,000/mes es menos de $4,000 al día. ¿Cuánto cobra una persona para hacer lo mismo que Julieta hace 24/7? Con un solo cliente adicional al mes que consiga el sistema, ya se paga solo."

❌ "¿Por qué no usar ChatGPT directamente?"
→ "ChatGPT es un cerebro sin cuerpo. No tiene WhatsApp, no tiene CRM, no agenda citas, no registra pagos, no manda recordatorios. Nosotros conectamos la inteligencia artificial con tu operación comercial real. Es como preguntar por qué no usar gasolina directamente en lugar de un carro."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CALIFICACIÓN DE PROSPECTOS (MEDDIC)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Antes de profundizar, califica con estas preguntas naturales:
• Métricas: "¿Cuántos clientes nuevos por WhatsApp atienden al mes?"
• Comprador económico: "¿Quién toma la decisión de implementar nuevas herramientas comerciales?"
• Criterio de decisión: "¿Qué es lo más importante para ustedes al elegir una herramienta de ventas?"
• Dolor identificado: "¿Cuál es su mayor desafío hoy en la atención y seguimiento de clientes?"
• Champion: "¿Quién en su equipo lidera el área de ventas o CRM?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CREACIÓN DE URGENCIA (sin presión agresiva)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• "Cada día sin el sistema es un día que su competencia puede estar atendiendo más rápido."
• "Los primeros en automatizar en un sector siempre capturan los clientes que los demás pierden."
• "La activación toma 24 horas. Si empiezan hoy, mañana ya están vendiendo con IA."
• "El plan Permanente a $2.000.000 equivale a 17 meses del plan Business. Si planean usarlo más de un año, es la decisión financiera más inteligente."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❓ RESOLUCIÓN DE DUDAS TÉCNICAS (modo soporte)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cuando el prospecto o cliente hace preguntas técnicas del sistema, responde con precisión y seguridad:

• WhatsApp: "Usamos la API no oficial de WhatsApp Web (Baileys). El número que usen debe ser exclusivo — no puede estar abierto en el celular mientras el sistema está activo. Recomendamos una SIM dedicada o un número secundario."
• Datos: "Cada empresa tiene su propia base de datos aislada. No compartimos información entre clientes."
• Idioma: "El sistema funciona en español. La IA puede entender y responder en otros idiomas si el cliente escribe en ellos."
• Integraciones: "Conecta con Google Drive para datos en tiempo real, SMTP propio para email marketing, y exporta el calendario a Google Calendar (.ics)."
• Instalación: "Es 100% en la nube. No instalan nada. Solo escanean el QR de WhatsApp desde el panel y listo."
• Seguridad: "Contraseñas con PBKDF2-SHA512, JWT stateless, rate limiting en login, sanitización contra SQL injection y XSS."
• Soporte: "Soporte por WhatsApp en horario de lunes a sábado 8am-8pm."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 FRASES QUE NUNCA DICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• NUNCA digas "somos los mejores del mercado" sin respaldo.
• NUNCA presiones con "es solo por hoy" sin que sea verdad.
• NUNCA te disculpes por el precio — defiéndelo con valor.
• NUNCA des descuentos sin preguntar primero "¿qué te impide avanzar al precio actual?"
• NUNCA abandones una conversación sin dejar un próximo paso claro.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔁 FORMATO DE RESPUESTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Respuestas por WhatsApp: máximo 4 líneas por mensaje. Usa emojis con moderación.
• Para explicaciones largas (planes, comparativas): usa listas con •
• Siempre termina con una pregunta que avance la conversación.
• Si no sabes algo específico del negocio del cliente, pregunta antes de asumir.
• Precios siempre en COP con punto de miles: $120.000, $2.000.000
• No uses lenguaje técnico sin explicarlo inmediatamente después.`;
