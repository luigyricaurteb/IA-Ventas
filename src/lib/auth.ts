import crypto from "node:crypto";
import { getMasterUser, checkRateLimit, recordLoginAttempt } from "./master/db-master";
import { getCompanyDb } from "./master/db-company";
import { getCompanyBySlug } from "./master/db-master";

const INSECURE_JWT_SECRETS = new Set([
  "agente-dmc-secret-2026-changeme", "", undefined,
]);
if (process.env.NODE_ENV === "production" && INSECURE_JWT_SECRETS.has(process.env.JWT_SECRET)) {
  throw new Error("CRÍTICO: JWT_SECRET debe ser un valor aleatorio seguro en producción. Configúralo en Railway → Variables.");
}
if (process.env.NODE_ENV === "production" && (!process.env.MASTER_PASSWORD || process.env.MASTER_PASSWORD === "master123")) {
  throw new Error("CRÍTICO: MASTER_PASSWORD debe configurarse en Railway → Variables antes de iniciar en producción.");
}

const JWT_SECRET     = process.env.JWT_SECRET     || "agente-dmc-secret-2026-changeme";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD  || crypto.randomBytes(24).toString("hex");
const MASTER_PASS    = process.env.MASTER_PASSWORD || "master123";
const MASTER_SALT_V  = process.env.MASTER_SALT     || "master-fixed-salt-2026";

// ── JWT ───────────────────────────────────────────────────────────────────

export function createJWT(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body   = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000) })).toString("base64url");
  const sig    = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJWT(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".");
    if (!header || !body || !sig) return null;
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Date.now()/1000) return null;
    return payload;
  } catch { return null; }
}

// ── Contraseñas ───────────────────────────────────────────────────────────

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s    = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, s, 100000, 64, "sha512").toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: computed } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}

// ── Sanitización de inputs (SQL injection / XSS prevention) ──────────────

export function sanitizeInput(value: string): string {
  return value
    .replace(/[<>]/g, "") // No XSS
    .replace(/['"`;]/g, "") // No SQL injection básica (prepared statements ya protegen)
    .trim()
    .slice(0, 500); // Límite de longitud
}

// ── Login MASTER ──────────────────────────────────────────────────────────

export async function loginMaster(username: string, password: string, ip: string, companySlug = "platform"): Promise<{
  token: string;
  user: { id: number; username: string; name: string; role: "master"; company: string; isMaster: boolean; permissions: Record<string, boolean> };
} | null> {
  if (!checkRateLimit(ip, 5, 900)) return null;

  const user = getMasterUser(sanitizeInput(username));
  if (!user) { recordLoginAttempt(ip); return null; }
  if (!verifyPassword(password, user.password_hash, user.salt)) { recordLoginAttempt(ip); return null; }

  // Master tiene acceso a todos los módulos de su empresa
  const allPermissions: Record<string, boolean> = {
    chat:true, crm:true, calendar:true, accounting:true, suppliers:true,
    products:true, campaigns:true, documents:true, analytics:true, settings:true
  };

  const token = createJWT({
    sub:         String(user.id),
    role:        "master",
    company:     companySlug,
    permissions: allPermissions,
    is_admin:    true,
    exp:         Math.floor(Date.now()/1000) + 12*3600,
  });
  return { token, user: { id: user.id, username: user.username, name: user.name, role: "master", company: companySlug, isMaster: true, permissions: allPermissions } };
}

// ── Login empresa ─────────────────────────────────────────────────────────

export async function loginCompanyUser(companySlug: string, username: string, password: string, ip: string): Promise<{
  token: string;
  user: { id: number; username: string; name: string; permissions: Record<string, boolean>; is_admin: boolean };
} | null> {
  if (!checkRateLimit(`${ip}:${companySlug}`, 5, 900)) return null;

  const company = getCompanyBySlug(sanitizeInput(companySlug));
  if (!company || company.status === "suspended") { recordLoginAttempt(ip); return null; }

  const db = getCompanyDb(companySlug);

  // Garantizar que el admin de la empresa existe
  ensureCompanyAdmin(db);

  const user = db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(sanitizeInput(username)) as {
    id: number; username: string; name: string; password_hash: string; salt: string;
    permissions: string; is_admin: number; active: number;
  } | null;

  if (!user) { recordLoginAttempt(ip); return null; }
  if (!verifyPassword(password, user.password_hash, user.salt)) { recordLoginAttempt(ip); return null; }

  const permissions = JSON.parse(user.permissions || "{}") as Record<string, boolean>;

  // Filtrar permisos por el plan de la empresa
  const planPermissions = getPlanModules(company.plan_id);
  const effectivePermissions: Record<string, boolean> = {};
  for (const [mod, allowed] of Object.entries(permissions)) {
    effectivePermissions[mod] = allowed && (planPermissions[mod] !== false);
  }
  // Admin de empresa tiene todos los módulos del plan
  if (user.is_admin) {
    for (const [mod, allowed] of Object.entries(planPermissions)) {
      if (allowed) effectivePermissions[mod] = true;
    }
    // Ajustes y suscripción son siempre accesibles para el admin — no dependen del plan
    effectivePermissions['settings']     = true;
    effectivePermissions['subscription'] = true;
  }

  // Autopilot: solo si el master lo habilitó para esta empresa
  try {
    const autopilotCfg = db.prepare("SELECT autopilot_enabled FROM company_config WHERE id=1").get() as { autopilot_enabled: number } | null;
    if (autopilotCfg?.autopilot_enabled === 1) effectivePermissions['autopilot'] = true;
  } catch {}

  const token = createJWT({
    sub:         String(user.id),
    company:     companySlug,
    permissions: effectivePermissions,
    is_admin:    Boolean(user.is_admin),
    exp:         Math.floor(Date.now()/1000) + 7*86400,
  });

  return { token, user: { id: user.id, username: user.username, name: user.name, permissions: effectivePermissions, is_admin: Boolean(user.is_admin) } };
}

function getPlanModules(planId: number | null): Record<string, boolean> {
  if (!planId) return {};
  try {
    const { getPlanById } = require("./master/db-master");
    const plan = getPlanById(planId);
    if (!plan) return {};
    return JSON.parse(plan.modules || "{}") as Record<string, boolean>;
  } catch { return {}; }
}

function ensureCompanyAdmin(db: import("better-sqlite3").Database): void {
  const count = (db.prepare("SELECT COUNT(*) as c FROM users WHERE is_admin=1").get() as { c: number }).c;
  if (count === 0) {
    // Use random salt so each company's admin hash is unique
    const { hash, salt } = hashPassword(ADMIN_PASSWORD);
    db.prepare("INSERT OR IGNORE INTO users (username, name, password_hash, salt, permissions, is_admin) VALUES ('admin', 'Administrador', ?, ?, ?, 1)")
      .run(hash, salt, JSON.stringify({ chat:true,crm:true,calendar:true,products:true,campaigns:true,documents:true,analytics:true,suppliers:true,accounting:true,settings:true }));
  }
  // Never overwrite existing admin passwords — admins manage their own credentials
}

// ── Verificar token y obtener usuario ─────────────────────────────────────

export interface AuthUser {
  sub: string;
  role?: "master";
  company?: string;
  permissions?: Record<string, boolean>;
  is_admin?: boolean;
}

export function getUserFromToken(token: string): AuthUser | null {
  const payload = verifyJWT(token);
  if (!payload || typeof payload.sub !== "string") return null;
  return payload as unknown as AuthUser;
}

export function logout(_token: string): void { /* JWT stateless */ }

// ── Módulos disponibles ───────────────────────────────────────────────────

export type Module = "chat"|"crm"|"calendar"|"accounting"|"suppliers"|"products"|"campaigns"|"documents"|"settings"|"analytics";
export const ALL_MODULES: Module[] = ["chat","crm","calendar","accounting","suppliers","products","campaigns","documents","settings","analytics"];

export function getAllowedModules(permissions: Record<string, boolean> | undefined, isMaster = false): Module[] {
  if (isMaster) return [...ALL_MODULES, "master" as Module];
  if (!permissions) return [];
  return ALL_MODULES.filter(m => permissions[m] === true);
}

export function canAccess(permissions: Record<string, boolean> | undefined, module: string, isMaster = false): boolean {
  if (isMaster) return true;
  if (!permissions) return false;
  return permissions[module] === true;
}
