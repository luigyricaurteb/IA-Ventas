import crypto from "node:crypto";
import { getUserByUsername, getSessionUser, createSession, deleteSession, type User } from "./db";

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, s, 100000, 64, "sha512").toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: computed } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function loginUser(username: string, password: string): Promise<{ token: string; user: Omit<User, "password_hash" | "salt"> } | null> {
  const user = getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash, user.salt)) return null;

  const token = generateToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400; // 7 días
  createSession(user.id, token, expiresAt);

  const { password_hash: _, salt: __, ...safe } = user;
  return { token, user: safe };
}

export function getUserFromToken(token: string): Omit<User, "password_hash" | "salt"> | null {
  const user = getSessionUser(token);
  if (!user) return null;
  const { password_hash: _, salt: __, ...safe } = user;
  return safe;
}

export function logout(token: string): void {
  deleteSession(token);
}

// Permisos por rol
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
