import crypto from "node:crypto";
import { getUserByUsername, getUserById, type User } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "agente-dmc-secret-2026-changeme";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// ── JWT sin librerías externas ────────────────────────────────────────────

export function createJWT(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body   = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
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
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Contraseña determinista para admin ────────────────────────────────────
// Usa ADMIN_SALT fija para que el hash sea siempre el mismo entre reinicios

const ADMIN_SALT = process.env.ADMIN_SALT || "agente-dmc-fixed-salt-2026";

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s    = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, s, 100000, 64, "sha512").toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: computed } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}

// Asegura que el admin existe siempre con password desde env var
export function ensureAdminUser(): void {
  const { hash, salt } = hashPassword(ADMIN_PASSWORD, ADMIN_SALT);
  const db = require("./db").default;
  // Actualizar hash del admin (por si cambió ADMIN_PASSWORD)
  const existing = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE username = 'admin'").run(hash, salt);
  } else {
    db.prepare("INSERT INTO users (username, name, password_hash, salt, role) VALUES ('admin', 'Administrador', ?, ?, 'admin')").run(hash, salt);
  }
}

// ── Login y sesión via JWT ────────────────────────────────────────────────

export async function loginUser(username: string, password: string): Promise<{
  token: string;
  user: Omit<User, "password_hash" | "salt">;
} | null> {
  const user = getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash, user.salt)) return null;

  const token = createJWT({
    sub:  String(user.id),
    role: user.role,
    exp:  Math.floor(Date.now() / 1000) + 7 * 86400, // 7 días
  });

  const { password_hash: _, salt: __, ...safe } = user;
  return { token, user: safe };
}

export function getUserFromToken(token: string): Omit<User, "password_hash" | "salt"> | null {
  const payload = verifyJWT(token);
  if (!payload || typeof payload.sub !== "string") return null;
  const user = getUserById(Number(payload.sub));
  if (!user) return null;
  const { password_hash: _, salt: __, ...safe } = user;
  return safe;
}

export function logout(_token: string): void {
  // Con JWT no hay sesión en DB que borrar
}

// ── Permisos por rol ──────────────────────────────────────────────────────

export type Module = "chat" | "crm" | "calendar" | "accounting" | "suppliers" | "products" | "campaigns" | "documents" | "settings" | "analytics";

const ROLE_PERMISSIONS: Record<string, Module[]> = {
  admin:         ["chat","crm","calendar","accounting","suppliers","products","campaigns","documents","settings","analytics"],
  ventas:        ["chat","crm","calendar","products","analytics"],
  contabilidad:  ["accounting","suppliers","calendar","analytics"],
  operaciones:   ["chat","calendar","crm"],
  marketing:     ["campaigns","crm","analytics"],
};

export function getAllowedModules(role: string): Module[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function canAccess(role: string, module: Module): boolean {
  return getAllowedModules(role).includes(module);
}
