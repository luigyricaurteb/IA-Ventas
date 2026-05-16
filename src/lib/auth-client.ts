// Módulo cliente — sin imports de Node/DB

export type Module = "chat"|"crm"|"calendar"|"accounting"|"suppliers"|"products"|"campaigns"|"documents"|"settings"|"analytics";
export const ALL_MODULES: Module[] = ["chat","crm","calendar","accounting","suppliers","products","campaigns","documents","settings","analytics"];

export function getAllowedModules(permissions: Record<string, boolean> | undefined, isMaster = false): Module[] {
  if (isMaster) return [...ALL_MODULES];
  if (!permissions) return [];
  return ALL_MODULES.filter(m => permissions[m] === true);
}

export function canAccess(permissions: Record<string, boolean> | undefined, module: string, isMaster = false): boolean {
  if (isMaster) return true;
  if (!permissions) return false;
  return permissions[module] === true;
}
