import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "messages.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read/write performance.
// busy_timeout tells SQLite to retry for up to 10 s before throwing
// SQLITE_BUSY, which prevents lock errors when multiple processes
// (e.g. Next.js build workers) access the database simultaneously.
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 10000");
db.pragma("foreign_keys = ON");

db.exec(`
  -- ── Conversaciones WhatsApp ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

  -- ── Estado de conexión Baileys ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS connection_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT CHECK(status IN ('disconnected','qr','connecting','connected')) NOT NULL DEFAULT 'disconnected',
    qr_string TEXT,
    phone TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  INSERT OR IGNORE INTO connection_state (id, status) VALUES (1, 'disconnected');

  -- ── Outbox mensajes humanos ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    content TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(sent, created_at);

  -- ── Configuración empresa ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS company_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT DEFAULT 'Mi Empresa',
    phone TEXT,
    email TEXT,
    logo_filename TEXT,
    business_hours_start INTEGER DEFAULT 8,
    business_hours_end INTEGER DEFAULT 18,
    business_days TEXT DEFAULT '1,2,3,4,5',
    ai_name TEXT DEFAULT 'Julieta',
    ai_general_instructions TEXT,
    nequi_phone TEXT,
    daviplata_phone TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  INSERT OR IGNORE INTO company_config (id) VALUES (1);

  -- ── Aprendizajes de la IA ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS ai_learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Cuentas bancarias ────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT NOT NULL,
    account_type TEXT CHECK(account_type IN ('corriente','ahorros')) NOT NULL DEFAULT 'ahorros',
    account_number TEXT NOT NULL,
    account_holder TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Configuración SMTP ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS smtp_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT,
    port INTEGER DEFAULT 587,
    secure INTEGER DEFAULT 0,
    user TEXT,
    password TEXT,
    from_name TEXT,
    from_email TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  INSERT OR IGNORE INTO smtp_config (id) VALUES (1);

  -- ── Productos & Servicios ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_per_person REAL NOT NULL DEFAULT 0,
    ai_instructions TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Documentos legales ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS legal_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'data_treatment',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS consent_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    document_id INTEGER NOT NULL REFERENCES legal_documents(id),
    accepted INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Contactos CRM ────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES conversations(id),
    full_name TEXT,
    email TEXT,
    company TEXT,
    interest TEXT,
    budget TEXT,
    travel_date TEXT,
    people_count INTEGER,
    unsubscribed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_conv ON contacts(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

  -- ── CRM Deals ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS crm_deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id),
    conversation_id INTEGER REFERENCES conversations(id),
    stage TEXT CHECK(stage IN ('NUEVO','CALIFICADO','PROPUESTA','NEGOCIACION','GANADO','PERDIDO')) NOT NULL DEFAULT 'NUEVO',
    product_id INTEGER REFERENCES products(id),
    people_count INTEGER,
    total_value REAL,
    notes TEXT,
    lost_reason TEXT,
    stage_changed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_deals_stage ON crm_deals(stage);
  CREATE INDEX IF NOT EXISTS idx_deals_conv ON crm_deals(conversation_id);

  CREATE TABLE IF NOT EXISTS crm_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Estado del bot por conversación (máquina de estados) ─────────────
  CREATE TABLE IF NOT EXISTS bot_conversation_state (
    conversation_id INTEGER PRIMARY KEY REFERENCES conversations(id),
    state TEXT NOT NULL DEFAULT 'INIT',
    data TEXT NOT NULL DEFAULT '{}',
    selected_product_id INTEGER REFERENCES products(id),
    opted_out INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Rate limit anti-bloqueo ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS message_rate_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    sent_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_rate_log ON message_rate_log(phone, sent_at);

  -- ── Campañas email ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    target_stage TEXT,
    status TEXT CHECK(status IN ('draft','sending','sent','failed')) NOT NULL DEFAULT 'draft',
    recipients_count INTEGER DEFAULT 0,
    sent_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id),
    email TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending','sent','failed')) NOT NULL DEFAULT 'pending',
    sent_at INTEGER,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS email_unsubscribes (
    email TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Usuarios y sesiones ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin','ventas','contabilidad','operaciones','marketing'))
      NOT NULL DEFAULT 'ventas',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

  -- ── Proveedores ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nit TEXT,
    email TEXT,
    phone TEXT,
    contact_person TEXT,
    rnt TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS supplier_bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    account_type TEXT CHECK(account_type IN ('corriente','ahorros')) NOT NULL DEFAULT 'ahorros',
    account_number TEXT NOT NULL,
    account_holder TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS supplier_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    doc_type TEXT CHECK(doc_type IN ('rut','camara_comercio','otro')) NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Relación productos ↔ proveedores
  CREATE TABLE IF NOT EXISTS product_suppliers (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, supplier_id)
  );

  -- ── Contabilidad ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS accounting_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reservation_id INTEGER REFERENCES reservations(id),
    deal_id INTEGER REFERENCES crm_deals(id),
    client_name TEXT,
    service_name TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'COP',
    notes TEXT,
    income_date INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_income_date ON accounting_income(income_date);

  CREATE TABLE IF NOT EXISTS accounting_expense (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER REFERENCES suppliers(id),
    reservation_id INTEGER REFERENCES reservations(id),
    deal_id INTEGER REFERENCES crm_deals(id),
    category TEXT NOT NULL DEFAULT 'general',
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'COP',
    expense_date INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_expense_date ON accounting_expense(expense_date);

  -- ── Alertas de Julieta (cuando no sabe responder) ───────────────────
  CREATE TABLE IF NOT EXISTS julieta_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    question TEXT NOT NULL,
    julieta_response TEXT,
    human_answer TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    saved_as_learning INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_julieta_alerts_resolved ON julieta_alerts(resolved, created_at);

  -- ── Comprobantes de pago ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS payment_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    deal_id INTEGER REFERENCES crm_deals(id),
    filename TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    reviewed INTEGER NOT NULL DEFAULT 0,
    reviewed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_proofs_reviewed ON payment_proofs(reviewed, created_at);

  -- ── Reservas / Calendario ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER REFERENCES crm_deals(id),
    contact_id INTEGER REFERENCES contacts(id),
    reservation_code TEXT UNIQUE,
    client_name TEXT,
    service_name TEXT,
    service_date INTEGER NOT NULL,
    people_count INTEGER DEFAULT 1,
    total_value REAL,
    status TEXT CHECK(status IN ('pending','confirmed','completed','cancelled'))
      NOT NULL DEFAULT 'pending',
    notes TEXT,
    reminder_24h_sent INTEGER NOT NULL DEFAULT 0,
    reminder_post_sent INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(service_date);
  CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
`);

db.pragma("busy_timeout = 30000");

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface Conversation {
  id: number; phone: string; name: string | null;
  mode: "AI" | "HUMAN"; last_message_at: number | null; created_at: number;
}
export interface ConversationWithPreview extends Conversation {
  last_message_preview: string | null;
}
export interface Message {
  id: number; conversation_id: number;
  role: "user" | "assistant" | "human"; content: string; created_at: number;
}
export interface ConnectionState {
  id: 1; status: "disconnected" | "qr" | "connecting" | "connected";
  qr_string: string | null; phone: string | null; updated_at: number;
}
export interface OutboxItem {
  id: number; conversation_id: number; phone: string;
  content: string; sent: number; created_at: number;
}
export interface AiLearning {
  id: number; topic: string; content: string; created_at: number;
}

export interface CompanyConfig {
  id: 1; name: string | null; phone: string | null; email: string | null;
  logo_filename: string | null; business_hours_start: number;
  business_hours_end: number; business_days: string;
  ai_name: string | null; ai_general_instructions: string | null;
  nequi_phone: string | null; daviplata_phone: string | null;
  updated_at: number;
}
export interface BankAccount {
  id: number; bank_name: string; account_type: "corriente" | "ahorros";
  account_number: string; account_holder: string | null;
  active: number; created_at: number;
}
export interface SmtpConfig {
  id: 1; host: string | null; port: number; secure: number;
  user: string | null; password: string | null;
  from_name: string | null; from_email: string | null; updated_at: number;
}
export interface Product {
  id: number; name: string; description: string | null;
  price_per_person: number; ai_instructions: string | null;
  active: number; created_at: number;
}
export interface ProductImage {
  id: number; product_id: number; filename: string;
  order_index: number; created_at: number;
}
export interface LegalDocument {
  id: number; type: string; title: string; content: string;
  version: string; active: number; created_at: number;
}
export interface Contact {
  id: number; conversation_id: number | null; full_name: string | null;
  email: string | null; company: string | null; interest: string | null;
  budget: string | null; travel_date: string | null; people_count: number | null;
  unsubscribed: number; created_at: number; updated_at: number;
}
export type CrmStage = "NUEVO" | "CALIFICADO" | "PROPUESTA" | "NEGOCIACION" | "GANADO" | "PERDIDO";
export interface CrmDeal {
  id: number; contact_id: number | null; conversation_id: number | null;
  stage: CrmStage; product_id: number | null; people_count: number | null;
  total_value: number | null; notes: string | null; lost_reason: string | null;
  stage_changed_at: number; created_at: number; updated_at: number;
}
export interface CrmDealWithDetails extends CrmDeal {
  contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; product_name: string | null;
}
export interface CrmActivity {
  id: number; deal_id: number; type: string;
  description: string; created_at: number;
}
export type BotState =
  | "INIT" | "CONSENT_PENDING" | "CONSENT_REJECTED"
  | "COLLECTING_NAME" | "COLLECTING_EMAIL" | "COLLECTING_COMPANY"
  | "COLLECTING_INTEREST" | "COLLECTING_BUDGET" | "COLLECTING_DATE"
  | "BROWSING" | "PRODUCT_SELECTED" | "COLLECTING_PEOPLE"
  | "QUOTE_SENT" | "AWAITING_PAYMENT" | "DONE";
export interface BotConversationState {
  conversation_id: number; state: BotState; data: string;
  selected_product_id: number | null; opted_out: number; updated_at: number;
}
export interface Campaign {
  id: number; name: string; subject: string; body_html: string;
  target_stage: string | null; status: "draft" | "sending" | "sent" | "failed";
  recipients_count: number; sent_at: number | null; created_at: number;
}

// ── Helpers existentes ────────────────────────────────────────────────────

export function getOrCreateConversation(phone: string, name?: string): Conversation {
  const existing = db.prepare<[string], Conversation>(
    "SELECT * FROM conversations WHERE phone = ?"
  ).get(phone);
  if (existing) {
    if (name && name !== existing.name) {
      db.prepare("UPDATE conversations SET name = ? WHERE id = ?").run(name, existing.id);
      existing.name = name;
    }
    return existing;
  }
  return db.prepare<[string, string | null], Conversation>(
    "INSERT INTO conversations (phone, name) VALUES (?, ?) RETURNING *"
  ).get(phone, name ?? null)!;
}

export function getConversationById(id: number): Conversation | null {
  return db.prepare<[number], Conversation>("SELECT * FROM conversations WHERE id = ?").get(id) ?? null;
}

export const insertMessage = db.transaction(
  (conversationId: number, role: "user" | "assistant" | "human", content: string): Message => {
    const result = db.prepare<[number, string, string], Message>(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?) RETURNING *"
    ).get(conversationId, role, content)!;
    db.prepare("UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?").run(conversationId);
    return result;
  }
);

export function getMessages(conversationId: number, limit = 100): Message[] {
  return db.prepare<[number, number], Message>(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?"
  ).all(conversationId, limit);
}

export function getRecentHistory(conversationId: number, limit = 20): Message[] {
  const rows = db.prepare<[number, number], Message>(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(conversationId, limit);
  return rows.reverse();
}

export function setMode(conversationId: number, mode: "AI" | "HUMAN"): void {
  db.prepare("UPDATE conversations SET mode = ? WHERE id = ?").run(mode, conversationId);
}

export function listConversations(): ConversationWithPreview[] {
  return db.prepare<[], ConversationWithPreview>(`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview
    FROM conversations c ORDER BY c.last_message_at DESC NULLS LAST
  `).all();
}

export function getConnectionState(): ConnectionState {
  return db.prepare<[], ConnectionState>("SELECT * FROM connection_state WHERE id = 1").get()!;
}

export function setConnectionState(
  update: Partial<Pick<ConnectionState, "status" | "qr_string" | "phone">>
): void {
  const current = getConnectionState();
  db.prepare(
    "UPDATE connection_state SET status = ?, qr_string = ?, phone = ?, updated_at = unixepoch() WHERE id = 1"
  ).run(
    update.status ?? current.status,
    update.qr_string !== undefined ? update.qr_string : current.qr_string,
    update.phone !== undefined ? update.phone : current.phone
  );
}

export function enqueueOutbox(conversationId: number, phone: string, content: string): void {
  db.prepare("INSERT INTO outbox (conversation_id, phone, content) VALUES (?, ?, ?)").run(conversationId, phone, content);
}

export function getPendingOutbox(limit = 20): OutboxItem[] {
  return db.prepare<[number], OutboxItem>(
    "SELECT * FROM outbox WHERE sent = 0 ORDER BY created_at ASC LIMIT ?"
  ).all(limit);
}

export function markOutboxSent(id: number): void {
  db.prepare("UPDATE outbox SET sent = 1 WHERE id = ?").run(id);
}

export const deleteConversation = db.transaction((id: number): void => {
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM outbox WHERE conversation_id = ? AND sent = 0").run(id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
});

// ── Configuración empresa ─────────────────────────────────────────────────

export function getCompanyConfig(): CompanyConfig {
  return db.prepare<[], CompanyConfig>("SELECT * FROM company_config WHERE id = 1").get()!;
}

export function updateCompanyConfig(data: Partial<Omit<CompanyConfig, "id" | "updated_at">>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE company_config SET ${fields}, updated_at = unixepoch() WHERE id = 1`).run(...Object.values(data));
}

// ── Cuentas bancarias ─────────────────────────────────────────────────────

export function listBankAccounts(): BankAccount[] {
  return db.prepare<[], BankAccount>("SELECT * FROM bank_accounts ORDER BY id ASC").all();
}

export function insertBankAccount(data: Omit<BankAccount, "id" | "created_at">): BankAccount {
  return db.prepare<[string, string, string, string | null, number], BankAccount>(
    "INSERT INTO bank_accounts (bank_name, account_type, account_number, account_holder, active) VALUES (?, ?, ?, ?, ?) RETURNING *"
  ).get(data.bank_name, data.account_type, data.account_number, data.account_holder ?? null, data.active)!;
}

export function deleteBankAccount(id: number): void {
  db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(id);
}

// ── SMTP ──────────────────────────────────────────────────────────────────

export function getSmtpConfig(): SmtpConfig {
  return db.prepare<[], SmtpConfig>("SELECT * FROM smtp_config WHERE id = 1").get()!;
}

export function updateSmtpConfig(data: Partial<Omit<SmtpConfig, "id" | "updated_at">>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE smtp_config SET ${fields}, updated_at = unixepoch() WHERE id = 1`).run(...Object.values(data));
}

// ── Productos ─────────────────────────────────────────────────────────────

export function listProducts(onlyActive = false): Product[] {
  const q = onlyActive
    ? "SELECT * FROM products WHERE active = 1 ORDER BY id ASC"
    : "SELECT * FROM products ORDER BY id ASC";
  return db.prepare<[], Product>(q).all();
}

export function getProductById(id: number): Product | null {
  return db.prepare<[number], Product>("SELECT * FROM products WHERE id = ?").get(id) ?? null;
}

export function insertProduct(data: Omit<Product, "id" | "created_at">): Product {
  return db.prepare<[string, string | null, number, string | null, number], Product>(
    "INSERT INTO products (name, description, price_per_person, ai_instructions, active) VALUES (?, ?, ?, ?, ?) RETURNING *"
  ).get(data.name, data.description ?? null, data.price_per_person, data.ai_instructions ?? null, data.active)!;
}

export function updateProduct(id: number, data: Partial<Omit<Product, "id" | "created_at">>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE products SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
}

export function deleteProduct(id: number): void {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

export function getProductImages(productId: number): ProductImage[] {
  return db.prepare<[number], ProductImage>(
    "SELECT * FROM product_images WHERE product_id = ? ORDER BY order_index ASC"
  ).all(productId);
}

export function insertProductImage(productId: number, filename: string, orderIndex: number): ProductImage {
  return db.prepare<[number, string, number], ProductImage>(
    "INSERT INTO product_images (product_id, filename, order_index) VALUES (?, ?, ?) RETURNING *"
  ).get(productId, filename, orderIndex)!;
}

export function deleteProductImage(id: number): void {
  db.prepare("DELETE FROM product_images WHERE id = ?").run(id);
}

// ── Documentos legales ────────────────────────────────────────────────────

export function listLegalDocuments(): LegalDocument[] {
  return db.prepare<[], LegalDocument>("SELECT * FROM legal_documents ORDER BY id DESC").all();
}

export function getActiveLegalDocument(type = "data_treatment"): LegalDocument | null {
  return db.prepare<[string], LegalDocument>(
    "SELECT * FROM legal_documents WHERE type = ? AND active = 1 ORDER BY id DESC LIMIT 1"
  ).get(type) ?? null;
}

export function insertLegalDocument(data: Omit<LegalDocument, "id" | "created_at">): LegalDocument {
  return db.prepare<[string, string, string, string, number], LegalDocument>(
    "INSERT INTO legal_documents (type, title, content, version, active) VALUES (?, ?, ?, ?, ?) RETURNING *"
  ).get(data.type, data.title, data.content, data.version, data.active)!;
}

export function updateLegalDocument(id: number, data: Partial<Omit<LegalDocument, "id" | "created_at">>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE legal_documents SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
}

export function logConsent(conversationId: number, documentId: number, accepted: boolean): void {
  db.prepare("INSERT INTO consent_log (conversation_id, document_id, accepted) VALUES (?, ?, ?)").run(
    conversationId, documentId, accepted ? 1 : 0
  );
}

export function getConsentForConversation(conversationId: number): { accepted: number } | null {
  return db.prepare<[number], { accepted: number }>(
    "SELECT accepted FROM consent_log WHERE conversation_id = ? ORDER BY id DESC LIMIT 1"
  ).get(conversationId) ?? null;
}

// ── Contactos ─────────────────────────────────────────────────────────────

export function getContactByConversation(conversationId: number): Contact | null {
  return db.prepare<[number], Contact>("SELECT * FROM contacts WHERE conversation_id = ?").get(conversationId) ?? null;
}

export function upsertContact(conversationId: number, data: Partial<Omit<Contact, "id" | "conversation_id" | "created_at" | "updated_at">>): Contact {
  const existing = getContactByConversation(conversationId);
  if (existing) {
    const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE contacts SET ${fields}, updated_at = unixepoch() WHERE id = ?`).run(...Object.values(data), existing.id);
    return db.prepare<[number], Contact>("SELECT * FROM contacts WHERE id = ?").get(existing.id)!;
  }
  return db.prepare<[number, string | null, string | null, string | null, string | null, string | null, string | null, number | null], Contact>(
    "INSERT INTO contacts (conversation_id, full_name, email, company, interest, budget, travel_date, people_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).get(
    conversationId,
    (data.full_name as string) ?? null,
    (data.email as string) ?? null,
    (data.company as string) ?? null,
    (data.interest as string) ?? null,
    (data.budget as string) ?? null,
    (data.travel_date as string) ?? null,
    (data.people_count as number) ?? null
  )!;
}

export function listContacts(): Contact[] {
  return db.prepare<[], Contact>("SELECT * FROM contacts ORDER BY created_at DESC").all();
}

// ── CRM ───────────────────────────────────────────────────────────────────

export function getOrCreateDeal(conversationId: number, contactId?: number): CrmDeal {
  const existing = db.prepare<[number], CrmDeal>(
    "SELECT * FROM crm_deals WHERE conversation_id = ? ORDER BY id DESC LIMIT 1"
  ).get(conversationId);
  if (existing) return existing;
  return db.prepare<[number | null, number], CrmDeal>(
    "INSERT INTO crm_deals (contact_id, conversation_id) VALUES (?, ?) RETURNING *"
  ).get(contactId ?? null, conversationId)!;
}

export function updateDealStage(dealId: number, stage: CrmStage, lostReason?: string): void {
  db.prepare(
    "UPDATE crm_deals SET stage = ?, stage_changed_at = unixepoch(), updated_at = unixepoch(), lost_reason = ? WHERE id = ?"
  ).run(stage, lostReason ?? null, dealId);
  db.prepare(
    "INSERT INTO crm_activities (deal_id, type, description) VALUES (?, 'stage_change', ?)"
  ).run(dealId, `Etapa cambiada a ${stage}${lostReason ? ": " + lostReason : ""}`);
}

export function updateDealProduct(dealId: number, productId: number, peopleCount: number, totalValue: number): void {
  db.prepare(
    "UPDATE crm_deals SET product_id = ?, people_count = ?, total_value = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(productId, peopleCount, totalValue, dealId);
}

export function listDealsWithDetails(): CrmDealWithDetails[] {
  return db.prepare<[], CrmDealWithDetails>(`
    SELECT d.*,
      c.full_name AS contact_name,
      c.email AS contact_email,
      conv.phone AS contact_phone,
      p.name AS product_name
    FROM crm_deals d
    LEFT JOIN contacts c ON d.contact_id = c.id
    LEFT JOIN conversations conv ON d.conversation_id = conv.id
    LEFT JOIN products p ON d.product_id = p.id
    ORDER BY d.updated_at DESC
  `).all();
}

export function getDealActivities(dealId: number): CrmActivity[] {
  return db.prepare<[number], CrmActivity>(
    "SELECT * FROM crm_activities WHERE deal_id = ? ORDER BY created_at ASC"
  ).all(dealId);
}

export function addDealNote(dealId: number, note: string): void {
  db.prepare("INSERT INTO crm_activities (deal_id, type, description) VALUES (?, 'note', ?)").run(dealId, note);
}

// ── Máquina de estados del bot ────────────────────────────────────────────

export function getBotState(conversationId: number): BotConversationState | null {
  return db.prepare<[number], BotConversationState>(
    "SELECT * FROM bot_conversation_state WHERE conversation_id = ?"
  ).get(conversationId) ?? null;
}

export function setBotState(
  conversationId: number,
  state: BotState,
  data?: Record<string, unknown>,
  selectedProductId?: number | null
): void {
  const existing = getBotState(conversationId);
  const dataStr = data !== undefined ? JSON.stringify(data) : existing?.data ?? "{}";
  const productId = selectedProductId !== undefined ? selectedProductId : existing?.selected_product_id ?? null;
  if (existing) {
    db.prepare(
      "UPDATE bot_conversation_state SET state = ?, data = ?, selected_product_id = ?, updated_at = unixepoch() WHERE conversation_id = ?"
    ).run(state, dataStr, productId, conversationId);
  } else {
    db.prepare(
      "INSERT INTO bot_conversation_state (conversation_id, state, data, selected_product_id) VALUES (?, ?, ?, ?)"
    ).run(conversationId, state, dataStr, productId);
  }
}

export function setBotOptOut(conversationId: number): void {
  db.prepare(
    "INSERT INTO bot_conversation_state (conversation_id, state, opted_out) VALUES (?, 'CONSENT_REJECTED', 1) ON CONFLICT(conversation_id) DO UPDATE SET opted_out = 1, state = 'CONSENT_REJECTED', updated_at = unixepoch()"
  ).run(conversationId);
}

// ── Rate limit anti-bloqueo ───────────────────────────────────────────────

export function countRecentOutbound(phone: string, windowSeconds = 3600): number {
  const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
  const result = db.prepare<[string, number], { count: number }>(
    "SELECT COUNT(*) as count FROM message_rate_log WHERE phone = ? AND sent_at > ?"
  ).get(phone, cutoff);
  return result?.count ?? 0;
}

export function logOutboundMessage(phone: string): void {
  db.prepare("INSERT INTO message_rate_log (phone) VALUES (?)").run(phone);
  // Limpieza de logs viejos (> 24h)
  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  db.prepare("DELETE FROM message_rate_log WHERE sent_at < ?").run(cutoff);
}

// ── Campañas email ────────────────────────────────────────────────────────

export function listCampaigns(): Campaign[] {
  return db.prepare<[], Campaign>("SELECT * FROM campaigns ORDER BY created_at DESC").all();
}

export function getCampaignById(id: number): Campaign | null {
  return db.prepare<[number], Campaign>("SELECT * FROM campaigns WHERE id = ?").get(id) ?? null;
}

export function insertCampaign(data: Omit<Campaign, "id" | "recipients_count" | "sent_at" | "created_at">): Campaign {
  return db.prepare<[string, string, string, string | null, string], Campaign>(
    "INSERT INTO campaigns (name, subject, body_html, target_stage, status) VALUES (?, ?, ?, ?, ?) RETURNING *"
  ).get(data.name, data.subject, data.body_html, data.target_stage ?? null, data.status)!;
}

export function updateCampaign(id: number, data: Partial<Omit<Campaign, "id" | "created_at">>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE campaigns SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
}

export function getContactsForCampaign(stage?: string | null): Contact[] {
  const base = "SELECT c.* FROM contacts c WHERE c.email IS NOT NULL AND c.unsubscribed = 0 AND c.email NOT IN (SELECT email FROM email_unsubscribes)";
  if (!stage) return db.prepare<[], Contact>(base).all();
  return db.prepare<[string], Contact>(
    `${base} AND EXISTS (SELECT 1 FROM crm_deals d WHERE d.contact_id = c.id AND d.stage = ?)`
  ).all(stage);
}

export function insertCampaignRecipients(campaignId: number, contacts: Contact[]): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO campaign_recipients (campaign_id, contact_id, email) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    for (const c of contacts) {
      if (c.email) stmt.run(campaignId, c.id, c.email);
    }
  });
  tx();
  db.prepare("UPDATE campaigns SET recipients_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?) WHERE id = ?").run(campaignId, campaignId);
}

export function getPendingRecipients(campaignId: number, limit = 50) {
  return db.prepare<[number, number], { id: number; email: string; contact_id: number }>(
    "SELECT id, email, contact_id FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending' LIMIT ?"
  ).all(campaignId, limit);
}

export function updateRecipientStatus(id: number, status: "sent" | "failed", error?: string): void {
  db.prepare("UPDATE campaign_recipients SET status = ?, sent_at = unixepoch(), error = ? WHERE id = ?").run(status, error ?? null, id);
}

export function addUnsubscribe(email: string): void {
  db.prepare("INSERT OR IGNORE INTO email_unsubscribes (email) VALUES (?)").run(email);
  db.prepare("UPDATE contacts SET unsubscribed = 1 WHERE email = ?").run(email);
}

// ── Migración segura: columnas nuevas en tablas existentes ───────────────
for (const sql of [
  "ALTER TABLE company_config ADD COLUMN ai_name TEXT DEFAULT 'Julieta'",
  "ALTER TABLE company_config ADD COLUMN ai_general_instructions TEXT",
  "ALTER TABLE company_config ADD COLUMN nequi_phone TEXT",
  "ALTER TABLE company_config ADD COLUMN daviplata_phone TEXT",
  "ALTER TABLE reservations ADD COLUMN reservation_code TEXT",
  "ALTER TABLE reservations ADD COLUMN reminder_24h_sent INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE reservations ADD COLUMN reminder_post_sent INTEGER NOT NULL DEFAULT 0",
]) { try { db.exec(sql); } catch {} }

// ── Usuarios y autenticación ──────────────────────────────────────────────

export type UserRole = "admin" | "ventas" | "contabilidad" | "operaciones" | "marketing";

export interface User {
  id: number; username: string; name: string;
  password_hash: string; salt: string;
  role: UserRole; active: number; created_at: number;
}

export interface Session {
  id: number; user_id: number; token: string; expires_at: number; created_at: number;
}

export function getUserByUsername(username: string): User | null {
  return db.prepare<[string], User>("SELECT * FROM users WHERE username = ? AND active = 1").get(username) ?? null;
}
export function getUserById(id: number): User | null {
  return db.prepare<[number], User>("SELECT * FROM users WHERE id = ?").get(id) ?? null;
}
export function listUsers(): Omit<User, "password_hash" | "salt">[] {
  return db.prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").all() as Omit<User, "password_hash" | "salt">[];
}
export function insertUser(data: { username: string; name: string; password_hash: string; salt: string; role: UserRole }): User {
  db.prepare<[string, string, string, string, string]>(
    "INSERT OR IGNORE INTO users (username, name, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)"
  ).run(data.username, data.name, data.password_hash, data.salt, data.role);
  return db.prepare<[string], User>("SELECT * FROM users WHERE username = ?").get(data.username)!;
}
export function updateUser(id: number, data: Partial<{ name: string; role: UserRole; active: number; password_hash: string; salt: string }>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
}
export function deleteUser(id: number): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}
export function createSession(userId: number, token: string, expiresAt: number): void {
  db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").run(userId, token, expiresAt);
  // Limpiar sesiones expiradas
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Math.floor(Date.now() / 1000));
}
export function getSessionUser(token: string): User | null {
  const session = db.prepare<[string, number], { user_id: number }>(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?"
  ).get(token, Math.floor(Date.now() / 1000));
  if (!session) return null;
  return getUserById(session.user_id);
}
export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// Crear usuario admin por defecto — INSERT OR IGNORE para que no falle si ya existe
{
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync("admin123", salt, 100000, 64, "sha512").toString("hex");
  db.prepare(
    "INSERT OR IGNORE INTO users (username, name, password_hash, salt, role) VALUES ('admin', 'Administrador', ?, ?, 'admin')"
  ).run(hash, salt);
}

// ── Migración segura: nuevas tablas en BD existente ──────────────────────
for (const sql of [
  "ALTER TABLE company_config ADD COLUMN ai_name TEXT DEFAULT 'Julieta'",
  "ALTER TABLE company_config ADD COLUMN ai_general_instructions TEXT",
]) { try { db.exec(sql); } catch {} }

// ── Proveedores ───────────────────────────────────────────────────────────

export interface Supplier {
  id: number; name: string; nit: string | null; email: string | null;
  phone: string | null; contact_person: string | null; rnt: string | null;
  active: number; created_at: number;
}
export interface SupplierBankAccount {
  id: number; supplier_id: number; bank_name: string;
  account_type: "corriente" | "ahorros"; account_number: string;
  account_holder: string | null; created_at: number;
}
export interface SupplierDocument {
  id: number; supplier_id: number; doc_type: "rut" | "camara_comercio" | "otro";
  filename: string; original_name: string | null; created_at: number;
}

export function listSuppliers(): Supplier[] {
  return db.prepare<[], Supplier>("SELECT * FROM suppliers ORDER BY name ASC").all();
}
export function getSupplierById(id: number): Supplier | null {
  return db.prepare<[number], Supplier>("SELECT * FROM suppliers WHERE id = ?").get(id) ?? null;
}
export function insertSupplier(data: Omit<Supplier, "id" | "created_at">): Supplier {
  return db.prepare<[string, string | null, string | null, string | null, string | null, string | null, number], Supplier>(
    "INSERT INTO suppliers (name, nit, email, phone, contact_person, rnt, active) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).get(data.name, data.nit ?? null, data.email ?? null, data.phone ?? null, data.contact_person ?? null, data.rnt ?? null, data.active)!;
}
export function updateSupplier(id: number, data: Partial<Omit<Supplier, "id" | "created_at">>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE suppliers SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
}
export function deleteSupplier(id: number): void {
  db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
}
export function listSupplierBankAccounts(supplierId: number): SupplierBankAccount[] {
  return db.prepare<[number], SupplierBankAccount>("SELECT * FROM supplier_bank_accounts WHERE supplier_id = ?").all(supplierId);
}
export function insertSupplierBankAccount(supplierId: number, data: Omit<SupplierBankAccount, "id" | "supplier_id" | "created_at">): SupplierBankAccount {
  return db.prepare<[number, string, string, string, string | null], SupplierBankAccount>(
    "INSERT INTO supplier_bank_accounts (supplier_id, bank_name, account_type, account_number, account_holder) VALUES (?, ?, ?, ?, ?) RETURNING *"
  ).get(supplierId, data.bank_name, data.account_type, data.account_number, data.account_holder ?? null)!;
}
export function deleteSupplierBankAccount(id: number): void {
  db.prepare("DELETE FROM supplier_bank_accounts WHERE id = ?").run(id);
}
export function listSupplierDocuments(supplierId: number): SupplierDocument[] {
  return db.prepare<[number], SupplierDocument>("SELECT * FROM supplier_documents WHERE supplier_id = ?").all(supplierId);
}
export function insertSupplierDocument(supplierId: number, docType: string, filename: string, originalName: string): SupplierDocument {
  return db.prepare<[number, string, string, string], SupplierDocument>(
    "INSERT INTO supplier_documents (supplier_id, doc_type, filename, original_name) VALUES (?, ?, ?, ?) RETURNING *"
  ).get(supplierId, docType, filename, originalName)!;
}
export function deleteSupplierDocument(id: number): void {
  db.prepare("DELETE FROM supplier_documents WHERE id = ?").run(id);
}
export function getProductSuppliers(productId: number): Supplier[] {
  return db.prepare<[number], Supplier>(
    "SELECT s.* FROM suppliers s JOIN product_suppliers ps ON s.id = ps.supplier_id WHERE ps.product_id = ?"
  ).all(productId);
}
export function setProductSuppliers(productId: number, supplierIds: number[]): void {
  db.transaction(() => {
    db.prepare("DELETE FROM product_suppliers WHERE product_id = ?").run(productId);
    for (const sid of supplierIds) {
      db.prepare("INSERT OR IGNORE INTO product_suppliers (product_id, supplier_id) VALUES (?, ?)").run(productId, sid);
    }
  })();
}

// ── Contabilidad ──────────────────────────────────────────────────────────

export interface AccountingIncome {
  id: number; reservation_id: number | null; deal_id: number | null;
  client_name: string | null; service_name: string | null;
  amount: number; currency: string; notes: string | null;
  income_date: number; created_at: number;
}
export interface AccountingExpense {
  id: number; supplier_id: number | null; reservation_id: number | null;
  deal_id: number | null; category: string; description: string;
  amount: number; currency: string; expense_date: number; created_at: number;
}
export interface AccountingSummary {
  total_income: number; total_expense: number; margin: number;
}

export function insertIncome(data: Omit<AccountingIncome, "id" | "created_at">): AccountingIncome {
  return db.prepare<[number | null, number | null, string | null, string | null, number, string, string | null, number], AccountingIncome>(
    "INSERT INTO accounting_income (reservation_id, deal_id, client_name, service_name, amount, currency, notes, income_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).get(data.reservation_id, data.deal_id, data.client_name, data.service_name, data.amount, data.currency, data.notes, data.income_date)!;
}
export function listIncome(startTs?: number, endTs?: number): AccountingIncome[] {
  if (startTs && endTs) {
    return db.prepare<[number, number], AccountingIncome>(
      "SELECT * FROM accounting_income WHERE income_date BETWEEN ? AND ? ORDER BY income_date DESC"
    ).all(startTs, endTs);
  }
  return db.prepare<[], AccountingIncome>("SELECT * FROM accounting_income ORDER BY income_date DESC LIMIT 200").all();
}
export function insertExpense(data: Omit<AccountingExpense, "id" | "created_at">): AccountingExpense {
  return db.prepare<[number | null, number | null, number | null, string, string, number, string, number], AccountingExpense>(
    "INSERT INTO accounting_expense (supplier_id, reservation_id, deal_id, category, description, amount, currency, expense_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).get(data.supplier_id, data.reservation_id, data.deal_id, data.category, data.description, data.amount, data.currency, data.expense_date)!;
}
export function listExpenses(startTs?: number, endTs?: number): (AccountingExpense & { supplier_name: string | null })[] {
  const base = `SELECT e.*, s.name as supplier_name FROM accounting_expense e LEFT JOIN suppliers s ON e.supplier_id = s.id`;
  if (startTs && endTs) {
    return db.prepare<[number, number], AccountingExpense & { supplier_name: string | null }>(
      `${base} WHERE e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date DESC`
    ).all(startTs, endTs);
  }
  return db.prepare<[], AccountingExpense & { supplier_name: string | null }>(
    `${base} ORDER BY e.expense_date DESC LIMIT 200`
  ).all();
}
export function deleteExpense(id: number): void {
  db.prepare("DELETE FROM accounting_expense WHERE id = ?").run(id);
}
export function getAccountingSummary(startTs: number, endTs: number): AccountingSummary {
  const income  = (db.prepare<[number, number], { total: number }>("SELECT COALESCE(SUM(amount),0) as total FROM accounting_income WHERE income_date BETWEEN ? AND ?").get(startTs, endTs)?.total ?? 0);
  const expense = (db.prepare<[number, number], { total: number }>("SELECT COALESCE(SUM(amount),0) as total FROM accounting_expense WHERE expense_date BETWEEN ? AND ?").get(startTs, endTs)?.total ?? 0);
  return { total_income: income, total_expense: expense, margin: income - expense };
}

// ── Comprobantes de pago ──────────────────────────────────────────────────

export interface PaymentProof {
  id: number; conversation_id: number; deal_id: number | null;
  filename: string; mimetype: string; reviewed: number;
  reviewed_at: number | null; created_at: number;
}

export function insertPaymentProof(conversationId: number, dealId: number | null, filename: string, mimetype: string): PaymentProof {
  return db.prepare<[number, number | null, string, string], PaymentProof>(
    "INSERT INTO payment_proofs (conversation_id, deal_id, filename, mimetype) VALUES (?, ?, ?, ?) RETURNING *"
  ).get(conversationId, dealId, filename, mimetype)!;
}

export function getPendingProofsCount(): number {
  return (db.prepare<[], { count: number }>("SELECT COUNT(*) as count FROM payment_proofs WHERE reviewed = 0").get()?.count ?? 0);
}

export function listPendingProofs(): (PaymentProof & { contact_phone: string | null; contact_name: string | null })[] {
  return db.prepare<[], PaymentProof & { contact_phone: string | null; contact_name: string | null }>(`
    SELECT p.*, conv.phone AS contact_phone, cont.full_name AS contact_name
    FROM payment_proofs p
    LEFT JOIN conversations conv ON p.conversation_id = conv.id
    LEFT JOIN contacts cont ON conv.id = cont.conversation_id
    WHERE p.reviewed = 0
    ORDER BY p.created_at DESC
  `).all();
}

export function getProofsForConversation(conversationId: number): PaymentProof[] {
  return db.prepare<[number], PaymentProof>(
    "SELECT * FROM payment_proofs WHERE conversation_id = ? ORDER BY created_at DESC"
  ).all(conversationId);
}

export function markProofReviewed(id: number): void {
  db.prepare("UPDATE payment_proofs SET reviewed = 1, reviewed_at = unixepoch() WHERE id = ?").run(id);
}

// ── Reservas ──────────────────────────────────────────────────────────────

export interface Reservation {
  id: number; deal_id: number | null; contact_id: number | null;
  reservation_code: string | null;
  client_name: string | null; service_name: string | null;
  service_date: number; people_count: number; total_value: number | null;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes: string | null;
  reminder_24h_sent: number; reminder_post_sent: number;
  created_at: number; updated_at: number;
}

export function insertReservation(data: Omit<Reservation, "id" | "created_at" | "updated_at" | "reservation_code" | "reminder_24h_sent" | "reminder_post_sent">): Reservation {
  return db.prepare<[number | null, number | null, string | null, string | null, number, number, number | null, string, string | null], Reservation>(
    "INSERT INTO reservations (deal_id, contact_id, client_name, service_name, service_date, people_count, total_value, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).get(data.deal_id, data.contact_id, data.client_name, data.service_name, data.service_date, data.people_count, data.total_value, data.status, data.notes)!;
}

export function listReservationsByMonth(year: number, month: number): Reservation[] {
  const start = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
  const end   = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);
  return db.prepare<[number, number], Reservation>(
    "SELECT * FROM reservations WHERE service_date BETWEEN ? AND ? ORDER BY service_date ASC"
  ).all(start, end);
}

export function listReservationsByDay(timestamp: number): Reservation[] {
  const d = new Date(timestamp * 1000);
  const start = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
  const end   = start + 86399;
  return db.prepare<[number, number], Reservation>(
    "SELECT * FROM reservations WHERE service_date BETWEEN ? AND ? ORDER BY service_date ASC"
  ).all(start, end);
}

export function listReservationsPaginated(status: string | null, page: number, pageSize = 50): { rows: Reservation[]; total: number } {
  const offset = page * pageSize;
  const where  = status ? "WHERE status = ?" : "";
  const args   = status ? [status, pageSize, offset] : [pageSize, offset];
  const rows   = db.prepare<unknown[], Reservation>(
    `SELECT * FROM reservations ${where} ORDER BY service_date DESC LIMIT ? OFFSET ?`
  ).all(...args);
  const total  = (db.prepare<unknown[], { count: number }>(
    `SELECT COUNT(*) as count FROM reservations ${where}`
  ).get(...(status ? [status] : []))?.count ?? 0);
  return { rows, total };
}

export function updateReservation(id: number, data: Partial<Omit<Reservation, "id" | "created_at">>): void {
  const fields = Object.keys(data).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE reservations SET ${fields}, updated_at = unixepoch() WHERE id = ?`).run(...Object.values(data), id);
}

export function deleteReservation(id: number): void {
  db.prepare("DELETE FROM reservations WHERE id = ?").run(id);
}

export function generateReservationCode(id: number): string {
  const year = new Date().getFullYear();
  return `RSV-${year}-${String(id).padStart(4, "0")}`;
}

export function ensureReservationCode(id: number): string {
  const existing = db.prepare<[number], { reservation_code: string | null }>(
    "SELECT reservation_code FROM reservations WHERE id = ?"
  ).get(id);
  if (existing?.reservation_code) return existing.reservation_code;
  const code = generateReservationCode(id);
  db.prepare("UPDATE reservations SET reservation_code = ? WHERE id = ?").run(code, id);
  return code;
}

export function getReservationsForReminders(): (Reservation & { phone: string | null })[] {
  const now = Math.floor(Date.now() / 1000);
  const in24h = now + 86400;
  return db.prepare(`
    SELECT r.*, c.phone
    FROM reservations r
    LEFT JOIN contacts ct ON r.contact_id = ct.id
    LEFT JOIN conversations c ON ct.conversation_id = c.id
    WHERE r.status = 'confirmed'
      AND (
        (r.reminder_24h_sent = 0 AND r.service_date BETWEEN ? AND ?)
        OR (r.reminder_post_sent = 0 AND r.service_date + 7200 < ? AND r.service_date > ? - 172800)
      )
  `).all(now, in24h, now, now) as (Reservation & { phone: string | null })[];
}

export function markReminder24hSent(id: number): void {
  db.prepare("UPDATE reservations SET reminder_24h_sent = 1 WHERE id = ?").run(id);
}
export function markReminderPostSent(id: number): void {
  db.prepare("UPDATE reservations SET reminder_post_sent = 1 WHERE id = ?").run(id);
}

export function getReservationCountByDay(year: number, month: number): Record<number, number> {
  const start = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
  const end   = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);
  const rows  = db.prepare<[number, number], { day: number; count: number }>(
    "SELECT CAST(strftime('%d', datetime(service_date, 'unixepoch')) AS INTEGER) as day, COUNT(*) as count FROM reservations WHERE service_date BETWEEN ? AND ? GROUP BY day"
  ).all(start, end);
  return Object.fromEntries(rows.map((r) => [r.day, r.count]));
}

// ── Alertas de Julieta ────────────────────────────────────────────────────

export interface JulietaAlert {
  id: number; conversation_id: number; question: string;
  julieta_response: string | null; human_answer: string | null;
  resolved: number; saved_as_learning: number; created_at: number;
}

export function insertJulietaAlert(conversationId: number, question: string, julietaResponse?: string): JulietaAlert {
  return db.prepare<[number, string, string | null], JulietaAlert>(
    "INSERT INTO julieta_alerts (conversation_id, question, julieta_response) VALUES (?, ?, ?) RETURNING *"
  ).get(conversationId, question, julietaResponse ?? null)!;
}

export function listPendingJulietaAlerts(): (JulietaAlert & { phone: string | null; contact_name: string | null })[] {
  return db.prepare<[], JulietaAlert & { phone: string | null; contact_name: string | null }>(`
    SELECT ja.*, conv.phone, c.full_name as contact_name
    FROM julieta_alerts ja
    LEFT JOIN conversations conv ON ja.conversation_id = conv.id
    LEFT JOIN contacts c ON conv.id = c.conversation_id
    WHERE ja.resolved = 0
    ORDER BY ja.created_at DESC
  `).all();
}

export function getPendingJulietaAlertsCount(): number {
  return (db.prepare<[], { count: number }>("SELECT COUNT(*) as count FROM julieta_alerts WHERE resolved = 0").get()?.count ?? 0);
}

export function resolveJulietaAlert(id: number, humanAnswer: string, saveAsLearning: boolean, topic?: string): void {
  db.prepare("UPDATE julieta_alerts SET resolved = 1, human_answer = ?, saved_as_learning = ? WHERE id = ?")
    .run(humanAnswer, saveAsLearning ? 1 : 0, id);
  if (saveAsLearning && topic) {
    db.prepare("INSERT INTO ai_learnings (topic, content) VALUES (?, ?)").run(topic, humanAnswer);
  }
}

// ── Aprendizajes IA ───────────────────────────────────────────────────────

export function listAiLearnings(): AiLearning[] {
  return db.prepare<[], AiLearning>("SELECT * FROM ai_learnings ORDER BY created_at DESC").all();
}

export function insertAiLearning(topic: string, content: string): AiLearning {
  return db.prepare<[string, string], AiLearning>(
    "INSERT INTO ai_learnings (topic, content) VALUES (?, ?) RETURNING *"
  ).get(topic, content)!;
}

export function deleteAiLearning(id: number): void {
  db.prepare("DELETE FROM ai_learnings WHERE id = ?").run(id);
}

export default db;
