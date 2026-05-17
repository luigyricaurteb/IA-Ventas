// Módulo cliente — sin imports de Node/DB

export type Module = "chat"|"crm"|"calendar"|"accounting"|"suppliers"|"products"|"campaigns"|"documents"|"settings"|"analytics"|"master"|"help"|"flows"|"subscription";
export const ALL_MODULES: Module[] = ["chat","crm","calendar","accounting","suppliers","products","campaigns","documents","settings","analytics"];

// settings y subscription son siempre accesibles para admins, independiente del plan
const ADMIN_ALWAYS: Module[] = ["settings", "subscription"];

export function getAllowedModules(permissions: Record<string, boolean> | undefined, isMaster = false, isAdmin = false): Module[] {
  if (isMaster) return (["master", ...ALL_MODULES, "flows", "help"] as Module[]);
  if (!permissions) return [];
  const base = ALL_MODULES.filter(m => permissions[m] === true);
  if (isAdmin) {
    for (const m of ADMIN_ALWAYS) { if (!base.includes(m)) base.push(m); }
  }
  return ([...base, "subscription", "flows", "help"] as Module[]);
}

export function canAccess(permissions: Record<string, boolean> | undefined, module: string, isMaster = false, isAdmin = false): boolean {
  if (isMaster) return true;
  if (isAdmin && (module === "settings" || module === "subscription")) return true;
  if (!permissions) return false;
  return permissions[module] === true;
}
