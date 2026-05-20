"use client";

import { useEffect, useState } from "react";

export type Module = "chat" | "crm" | "calendar" | "accounting" | "suppliers" | "products" | "campaigns" | "documents" | "settings" | "analytics" | "master" | "help" | "flows" | "subscription" | "tickets" | "autopilot";

interface SidebarProps {
  active: Module;
  onChange: (m: Module) => void;
  allowedModules: Module[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onMobileOpen?: () => void;
}

const NAV_GROUPS: { label?: string; items: { id: Module; label: string; icon: string }[] }[] = [
  {
    items: [
      { id: "master", label: "Plataforma", icon: "🏛️" },
    ]
  },
  {
    label: "Principal",
    items: [
      { id: "chat",      label: "Chat",        icon: "💬" },
      { id: "crm",       label: "CRM",         icon: "👥" },
      { id: "calendar",  label: "Calendario",  icon: "📅" },
      { id: "analytics", label: "Analytics",   icon: "📊" },
    ]
  },
  {
    label: "Gestión",
    items: [
      { id: "autopilot",   label: "Autopilot",    icon: "🤖" },
      { id: "accounting",  label: "Contabilidad", icon: "💰" },
      { id: "products",    label: "Productos",    icon: "🛍️" },
      { id: "suppliers",   label: "Proveedores",  icon: "🤝" },
      { id: "campaigns",   label: "Campañas",     icon: "📧" },
      { id: "documents",   label: "Documentos",   icon: "📄" },
    ]
  },
  {
    label: "Sistema",
    items: [
      { id: "tickets",      label: "Soporte",     icon: "🎫" },
      { id: "flows",        label: "Flujos",      icon: "🔀" },
      { id: "settings",     label: "Ajustes",     icon: "⚙️" },
      { id: "subscription", label: "Suscripción", icon: "💳" },
      { id: "help",         label: "Manual",      icon: "📖" },
    ]
  }
];

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

  function handleClick(id: Module) { onChange(id); onMobileClose?.(); }

  const NavItem = ({ id, label, icon, compact = false }: { id: Module; label: string; icon: string; compact?: boolean }) => {
    const isActive = active === id;
    const badge = id === "chat" ? alertCount : 0;
    return (
      <button
        onClick={() => handleClick(id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 relative group ${
          isActive
            ? "bg-[#0077b6] text-white font-medium"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
        } ${compact ? "py-1.5" : ""}`}
      >
        <span className={`shrink-0 text-sm w-4 text-center ${isActive ? "opacity-100" : "opacity-75 group-hover:opacity-100"}`}>
          {icon}
        </span>
        <span className="text-sm truncate">{label}</span>
        {badge > 0 && (
          <span className="ml-auto bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1 shrink-0">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    );
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className={`flex items-center gap-2.5 px-4 ${mobile ? "py-4" : "py-5"} shrink-0`}
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-sm shrink-0"
          style={{ background: "var(--accent)" }}>
          H
        </div>
        <div>
          <span className="font-bold text-sm text-white tracking-wide">Hivo</span>
          <span className="block text-[10px] text-slate-500 leading-none -mt-0.5">Business Platform</span>
        </div>
        {mobile && (
          <button onClick={onMobileClose} className="ml-auto text-slate-500 hover:text-white text-lg leading-none">✕</button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter(item => allowedModules.includes(item.id));
          if (visibleItems.length === 0) return null;
          return (
            <div key={gi} className={gi > 0 ? "mt-4" : ""}>
              {group.label && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(item => (
                  <NavItem key={item.id} {...item} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex md:flex-col w-52 shrink-0 h-full" style={{ background: "#0f172a" }}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={onMobileClose} />
      )}

      {/* Mobile drawer */}
      <div className={`fixed top-0 left-0 h-full w-60 z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "#0f172a" }}>
        <SidebarContent mobile />
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t"
        style={{ background: "#0f172a", borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-around px-1 py-1">
          {MOBILE_NAV.filter(id => allowedModules.includes(id)).map(id => {
            const item = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === id);
            if (!item) return null;
            const badge = id === "chat" ? alertCount : 0;
            const isActive = active === id;
            return (
              <button key={id} onClick={() => onChange(id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[52px] transition-colors ${isActive ? "text-[#0077b6]" : "text-slate-500"}`}>
                <span className="text-lg relative">
                  {item.icon}
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{badge > 9 ? "9" : badge}</span>
                  )}
                </span>
                <span className={`text-[10px] font-medium ${isActive ? "text-[#0077b6]" : "text-slate-600"}`}>{item.label}</span>
              </button>
            );
          })}
          <button onClick={onMobileOpen} className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl min-w-[52px] text-slate-500">
            <span className="text-lg">☰</span>
            <span className="text-[10px] font-medium text-slate-600">Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
