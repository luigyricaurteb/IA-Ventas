"use client";

import { useEffect, useState } from "react";

export type Module = "chat" | "crm" | "calendar" | "accounting" | "suppliers" | "products" | "campaigns" | "documents" | "settings" | "analytics" | "master" | "help" | "flows" | "subscription";

interface SidebarProps {
  active: Module;
  onChange: (m: Module) => void;
  allowedModules: Module[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onMobileOpen?: () => void;
}

const ALL_ITEMS: { id: Module; label: string; icon: string; dividerAfter?: boolean }[] = [
  { id: "master",       label: "Plataforma",    icon: "🏛️", dividerAfter: true },
  { id: "chat",         label: "Chat",          icon: "💬" },
  { id: "crm",          label: "CRM",           icon: "👥" },
  { id: "calendar",     label: "Calendario",    icon: "📅" },
  { id: "analytics",    label: "Analytics",     icon: "📊" },
  { id: "accounting",   label: "Contabilidad",  icon: "💰" },
  { id: "suppliers",    label: "Proveedores",   icon: "🤝" },
  { id: "products",     label: "Productos",     icon: "🛍️" },
  { id: "campaigns",    label: "Campañas",      icon: "📧" },
  { id: "documents",    label: "Documentos",    icon: "📄" },
  { id: "settings",     label: "Ajustes",       icon: "⚙️" },
  { id: "flows",        label: "Flujos",        icon: "🔀" },
  { id: "subscription", label: "Suscripción",   icon: "💳" },
  { id: "help",         label: "Manual",        icon: "📖" },
];

// Items que se muestran en la barra inferior de móvil (los más usados)
const MOBILE_NAV: Module[] = ["chat", "crm", "calendar", "settings"];

export default function Sidebar({ active, onChange, allowedModules, mobileOpen = false, onMobileClose, onMobileOpen }: SidebarProps) {
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/alerts");
        if (res.ok) setAlertCount((await res.json() as { count: number }).count ?? 0);
      } catch {}
    }
    fetchAlerts();
    const iv = setInterval(fetchAlerts, 5000);
    return () => clearInterval(iv);
  }, []);

  const visibleItems = ALL_ITEMS.filter(item => allowedModules.includes(item.id));
  const mobileItems  = visibleItems.filter(item => MOBILE_NAV.includes(item.id));

  function handleClick(id: Module) {
    onChange(id);
    onMobileClose?.();
  }

  const itemClass = (id: Module) => {
    const isMaster = id === "master";
    if (isMaster) {
      return active === id
        ? "text-white font-semibold"
        : "text-amber-300/70 hover:text-amber-200";
    }
    return active === id
      ? "text-white font-semibold"
      : "text-[#c4a882] hover:text-[#e8d9c8]";
  };

  // ── Sidebar desktop ───────────────────────────────────────────────────────
  const desktopSidebar = (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 h-full" style={{ background: "var(--sidebar-bg)" }}>
      {/* Logo */}
      <div className="px-5 py-5 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black text-white" style={{ background: "var(--accent)" }}>H</div>
          <span className="font-bold text-sm tracking-wider" style={{ color: "var(--sidebar-text)" }}>Hivo</span>
        </div>
      </div>

      {/* Items — scrollable */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {visibleItems.map(item => {
          const badge = item.id === "chat" ? alertCount : 0;
          return (
            <div key={item.id}>
              <button
                onClick={() => handleClick(item.id)}
                title={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg transition-colors text-left ${itemClass(item.id)}`}
                style={{ width: "calc(100% - 0.75rem)" }}
              >
                <span className="text-base shrink-0 relative w-5 text-center">
                  {item.icon}
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className="text-sm font-medium truncate">{item.label}</span>
                {badge > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold shrink-0">
                    {badge}
                  </span>
                )}
              </button>
              {item.dividerAfter && <div className="mx-4 my-1.5 border-t border-white/5" />}
            </div>
          );
        })}
      </nav>
    </aside>
  );

  // ── Drawer móvil (slide-in desde la izquierda) ────────────────────────────
  const mobilDrawer = (
    <>
      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}
      {/* Drawer */}
      <div className={`fixed top-0 left-0 h-full w-64 z-50 flex flex-col shadow-2xl transition-transform duration-300 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ background: "var(--sidebar-bg)" }}>
        <div className="px-4 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-white font-bold text-sm">Hivo</span>
          <button onClick={onMobileClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleItems.map(item => {
            const badge = item.id === "chat" ? alertCount : 0;
            return (
              <div key={item.id}>
                <button
                  onClick={() => handleClick(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${itemClass(item.id)}`}
                >
                  <span className="text-xl shrink-0 relative w-6 text-center">
                    {item.icon}
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-medium">{item.label}</span>
                  {badge > 0 && <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{badge}</span>}
                </button>
                {item.dividerAfter && <div className="mx-4 my-1 border-t border-white/5" />}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );

  // ── Barra de navegación móvil inferior ────────────────────────────────────
  const mobileBottomNav = (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 safe-area-pb" style={{ background: "var(--sidebar-bg)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-around px-2 py-1">
        {mobileItems.map(item => {
          const badge = item.id === "chat" ? alertCount : 0;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[56px] transition-colors ${
                active === item.id ? "text-emerald-400" : "text-gray-500"
              }`}
            >
              <span className="text-xl relative">
                {item.icon}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                    {badge > 9 ? "9" : badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${active === item.id ? "text-emerald-400" : "text-gray-600"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
        {/* Botón "Más" → abre el drawer completo */}
        <button
          onClick={onMobileOpen}
          className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[56px] text-gray-500"
        >
          <span className="text-xl">☰</span>
          <span className="text-[10px] font-medium text-gray-600">Más</span>
        </button>
      </div>
    </nav>
  );

  return (
    <>
      {desktopSidebar}
      {mobilDrawer}
      {mobileBottomNav}
    </>
  );
}
