import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const STORAGE = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const MASTER_DB_PATH = path.join(STORAGE, "master.db");

// Durante el build de Next.js no hay volúmenes disponibles ni bot corriendo.
// Usamos :memory: para que los módulos se importen sin abrir archivos en disco.
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

if (!IS_BUILD && !fs.existsSync(STORAGE)) fs.mkdirSync(STORAGE, { recursive: true });

const masterDb = new Database(IS_BUILD ? ":memory:" : MASTER_DB_PATH);
masterDb.pragma("busy_timeout = 30000");
masterDb.pragma("journal_mode = WAL");
masterDb.pragma("foreign_keys = ON");

masterDb.exec(`
  -- ── Planes de suscripción ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_monthly REAL NOT NULL DEFAULT 0,
    price_yearly REAL,
    billing_cycle TEXT CHECK(billing_cycle IN ('monthly','yearly','permanent')) NOT NULL DEFAULT 'monthly',
    modules TEXT NOT NULL DEFAULT '{}',
    max_users INTEGER NOT NULL DEFAULT 3,
    max_wa_numbers INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Empresas afiliadas ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    nit TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    logo_filename TEXT,
    plan_id INTEGER REFERENCES plans(id),
    status TEXT CHECK(status IN ('active','suspended','trial','pending')) NOT NULL DEFAULT 'pending',
    db_path TEXT NOT NULL,
    auth_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
  CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

  -- ── Suscripciones / pagos ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    starts_at INTEGER NOT NULL DEFAULT (unixepoch()),
    ends_at INTEGER,
    status TEXT CHECK(status IN ('pending','active','expired','cancelled')) NOT NULL DEFAULT 'pending',
    payment_proof_file TEXT,
    payment_amount REAL,
    notes TEXT,
    approved_at INTEGER,
    approved_by INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON subscriptions(company_id, status);

  -- ── Usuarios MASTER (plataforma) ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS master_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Rate limiting para login ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    attempted_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(identifier, attempted_at);
`);

// Migraciones seguras para columnas añadidas después del despliegue inicial
for (const sql of [
  "ALTER TABLE companies ADD COLUMN nit TEXT",
  "ALTER TABLE companies ADD COLUMN address TEXT",
  "ALTER TABLE plans ADD COLUMN price_usd REAL DEFAULT 0",
]) { try { masterDb.exec(sql); } catch {} }

// Planes por defecto
const planCount = (masterDb.prepare("SELECT COUNT(*) as c FROM plans").get() as { c: number }).c;
if (planCount === 0) {
  masterDb.prepare(`
    INSERT INTO plans (name, description, price_monthly, billing_cycle, modules, max_users, max_wa_numbers)
    VALUES
      ('Starter', 'Ideal para pequeñas empresas', 29, 'monthly', '{"chat":true,"crm":true,"calendar":true,"products":true,"settings":true}', 3, 1),
      ('Pro', 'Para equipos en crecimiento', 59, 'monthly', '{"chat":true,"crm":true,"calendar":true,"products":true,"campaigns":true,"documents":true,"analytics":true,"suppliers":false,"accounting":false,"settings":true}', 8, 1),
      ('Business', 'Acceso completo a todos los módulos', 99, 'monthly', '{"chat":true,"crm":true,"calendar":true,"products":true,"campaigns":true,"documents":true,"analytics":true,"suppliers":true,"accounting":true,"settings":true}', 999, 3),
      ('Permanente', 'Pago único, acceso de por vida', 499, 'permanent', '{"chat":true,"crm":true,"calendar":true,"products":true,"campaigns":true,"documents":true,"analytics":true,"suppliers":true,"accounting":true,"settings":true}', 999, 5)
  `).run();
}

// Usuario master por defecto
{
  const MASTER_PASS = process.env.MASTER_PASSWORD || "master123";
  const MASTER_SALT_ENV = process.env.MASTER_SALT || "master-fixed-salt-2026";
  const hash = crypto.pbkdf2Sync(MASTER_PASS, MASTER_SALT_ENV, 100000, 64, "sha512").toString("hex");
  masterDb.prepare("INSERT OR IGNORE INTO master_users (username, name, password_hash, salt) VALUES ('master', 'Administrador Plataforma', ?, ?)").run(hash, MASTER_SALT_ENV);
}

// Empresa "platform" — empresa del master (auto-creada)
{
  const existing = masterDb.prepare("SELECT id FROM companies WHERE slug='platform'").get();
  if (!existing) {
    const STORAGE = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const dbPath   = path.join(STORAGE, "company_platform.db");
    const authPath = path.join(STORAGE, "auth", "company_platform");
    try { fs.mkdirSync(authPath, { recursive: true }); } catch {}
    const planId = (masterDb.prepare("SELECT id FROM plans ORDER BY price_monthly DESC LIMIT 1").get() as { id: number } | null)?.id ?? null;
    masterDb.prepare("INSERT OR IGNORE INTO companies (slug,name,email,db_path,auth_path,status,plan_id) VALUES ('platform','Mi Empresa (Plataforma)','admin@plataforma.com',?,?,'active',?)").run(dbPath, authPath, planId);
  }
}

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface Plan {
  id: number; name: string; description: string | null;
  price_monthly: number; price_usd: number; price_yearly: number | null;
  billing_cycle: string; modules: string;
  max_users: number; max_wa_numbers: number;
  active: number; created_at: number;
}

export interface Company {
  id: number; slug: string; name: string;
  nit: string | null; email: string | null; phone: string | null;
  address: string | null; logo_filename: string | null;
  plan_id: number | null; status: "active" | "suspended" | "trial" | "pending";
  db_path: string; auth_path: string;
  created_at: number; updated_at: number;
}

export interface CompanyWithPlan extends Company {
  plan_name: string | null; plan_modules: string | null;
  sub_status: string | null; sub_ends_at: number | null;
}

export interface Subscription {
  id: number; company_id: number; plan_id: number;
  billing_cycle: string; starts_at: number; ends_at: number | null;
  status: string; payment_proof_file: string | null;
  payment_amount: number | null; notes: string | null;
  approved_at: number | null; created_at: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function listPlans(): Plan[] {
  return masterDb.prepare("SELECT * FROM plans ORDER BY price_monthly ASC").all() as Plan[];
}
export function getPlanById(id: number): Plan | null {
  return masterDb.prepare<[number], Plan>("SELECT * FROM plans WHERE id = ?").get(id) ?? null;
}
export function upsertPlan(data: Partial<Plan> & { name: string; price_usd?: number }): Plan {
  const priceUsd = data.price_usd ?? 0;
  if (data.id) {
    masterDb.prepare("UPDATE plans SET name=?,description=?,price_monthly=?,price_usd=?,billing_cycle=?,modules=?,max_users=?,max_wa_numbers=?,active=? WHERE id=?")
      .run(data.name, data.description??null, data.price_monthly??0, priceUsd, data.billing_cycle??'monthly', data.modules??'{}', data.max_users??3, data.max_wa_numbers??1, data.active??1, data.id);
    return getPlanById(data.id)!;
  }
  return masterDb.prepare<unknown[], Plan>("INSERT INTO plans (name,description,price_monthly,price_usd,billing_cycle,modules,max_users,max_wa_numbers) VALUES (?,?,?,?,?,?,?,?) RETURNING *")
    .get(data.name, data.description??null, data.price_monthly??0, priceUsd, data.billing_cycle??'monthly', data.modules??'{}', data.max_users??3, data.max_wa_numbers??1)!;
}

export function listCompanies(): CompanyWithPlan[] {
  return masterDb.prepare<[], CompanyWithPlan>(`
    SELECT c.*, p.name as plan_name, p.modules as plan_modules,
      s.status as sub_status, s.ends_at as sub_ends_at
    FROM companies c
    LEFT JOIN plans p ON c.plan_id = p.id
    LEFT JOIN subscriptions s ON s.company_id = c.id AND s.status = 'active'
    ORDER BY c.name ASC
  `).all();
}
export function getCompanyBySlug(slug: string): Company | null {
  return masterDb.prepare<[string], Company>("SELECT * FROM companies WHERE slug = ?").get(slug) ?? null;
}
export function getCompanyById(id: number): Company | null {
  return masterDb.prepare<[number], Company>("SELECT * FROM companies WHERE id = ?").get(id) ?? null;
}
export function createCompany(data: { slug: string; name: string; nit?: string; email?: string; phone?: string; address?: string; plan_id?: number; status?: string }): Company {
  const dbPath   = path.join(STORAGE, `company_${data.slug}.db`);
  const authPath = path.join(STORAGE, "auth", `company_${data.slug}`);
  fs.mkdirSync(authPath, { recursive: true });
  return masterDb.prepare<unknown[], Company>(
    "INSERT INTO companies (slug,name,nit,email,phone,address,plan_id,db_path,auth_path,status) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *"
  ).get(data.slug, data.name, data.nit??null, data.email??null, data.phone??null, data.address??null, data.plan_id??null, dbPath, authPath, data.status??'pending')!;
}
export function updateCompany(id: number, data: Partial<Company>): void {
  const fields = Object.keys(data).filter(k=>k!=='id').map(k=>`${k}=?`).join(",");
  masterDb.prepare(`UPDATE companies SET ${fields}, updated_at=unixepoch() WHERE id=?`).run(...Object.values(data).filter((_,i)=>Object.keys(data)[i]!=='id'), id);
}

export function listSubscriptions(companyId?: number): Subscription[] {
  if (companyId) return masterDb.prepare<[number], Subscription>("SELECT * FROM subscriptions WHERE company_id=? ORDER BY created_at DESC").all(companyId);
  return masterDb.prepare<[], Subscription>("SELECT * FROM subscriptions ORDER BY created_at DESC").all();
}
export function createSubscription(data: Omit<Subscription, "id"|"created_at"|"approved_at">): Subscription {
  return masterDb.prepare<unknown[], Subscription>(
    "INSERT INTO subscriptions (company_id,plan_id,billing_cycle,starts_at,ends_at,status,payment_proof_file,payment_amount,notes) VALUES (?,?,?,?,?,?,?,?,?) RETURNING *"
  ).get(data.company_id, data.plan_id, data.billing_cycle, data.starts_at, data.ends_at??null, data.status, data.payment_proof_file??null, data.payment_amount??null, data.notes??null)!;
}
export function approveSubscription(id: number): void {
  const sub = masterDb.prepare<[number], Subscription>("SELECT * FROM subscriptions WHERE id=?").get(id);
  if (!sub) return;
  const now = Math.floor(Date.now()/1000);
  let endsAt: number | null = null;
  if (sub.billing_cycle === 'monthly') endsAt = now + 30*86400;
  else if (sub.billing_cycle === 'yearly') endsAt = now + 365*86400;
  masterDb.prepare("UPDATE subscriptions SET status='active', starts_at=?, ends_at=?, approved_at=? WHERE id=?").run(now, endsAt, now, id);
  masterDb.prepare("UPDATE companies SET status='active', plan_id=? WHERE id=?").run(sub.plan_id, sub.company_id);
  // Cancelar suscripciones previas activas
  masterDb.prepare("UPDATE subscriptions SET status='cancelled' WHERE company_id=? AND id!=? AND status='active'").run(sub.company_id, id);
}

// ── Rate limiting ─────────────────────────────────────────────────────────

export function checkRateLimit(identifier: string, maxAttempts = 5, windowSeconds = 900): boolean {
  const cutoff = Math.floor(Date.now()/1000) - windowSeconds;
  const count = (masterDb.prepare<[string, number], {c:number}>("SELECT COUNT(*) as c FROM login_attempts WHERE identifier=? AND attempted_at>?").get(identifier, cutoff)?.c ?? 0);
  return count < maxAttempts;
}
export function recordLoginAttempt(identifier: string): void {
  masterDb.prepare("INSERT INTO login_attempts (identifier) VALUES (?)").run(identifier);
  masterDb.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").run(Math.floor(Date.now()/1000) - 3600);
}

// ── Master user auth ──────────────────────────────────────────────────────

export function getMasterUser(username: string): { id: number; username: string; name: string; password_hash: string; salt: string } | null {
  return masterDb.prepare("SELECT * FROM master_users WHERE username=? AND active=1").get(username) as { id: number; username: string; name: string; password_hash: string; salt: string } | null;
}

// ── Alertas de vencimiento (próximos 5 días) ──────────────────────────────
export function getExpiringSubscriptions(): (Subscription & { company_name: string; company_email: string | null })[] {
  const now   = Math.floor(Date.now()/1000);
  const in5d  = now + 5*86400;
  return masterDb.prepare(`
    SELECT s.*, c.name as company_name, c.email as company_email
    FROM subscriptions s JOIN companies c ON s.company_id=c.id
    WHERE s.status='active' AND s.ends_at IS NOT NULL AND s.ends_at BETWEEN ? AND ?
  `).all(now, in5d) as (Subscription & { company_name: string; company_email: string | null })[];
}

export default masterDb;
