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

export function getCompanyDb(slug: string): Database.Database {
  if (dbCache.has(slug)) return dbCache.get(slug)!;

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
    INSERT OR IGNORE INTO company_config (id) VALUES (1);

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
    "ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
  ]) { try { db.exec(sql); } catch {} }
}
