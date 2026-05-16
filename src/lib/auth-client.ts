// Módulo cliente: solo lógica de roles, sin imports de Node/DB

export type Module = "chat" | "crm" | "calendar" | "accounting" | "suppliers" | "products" | "campaigns" | "documents" | "settings" | "analytics";

export type UserRole = "admin" | "ventas" | "contabilidad" | "operaciones" | "marketing";

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
