"use client";

import { useEffect, useState } from "react";

export type Module = "chat" | "crm" | "calendar" | "accounting" | "suppliers" | "products" | "campaigns" | "documents" | "settings" | "analytics" | "master" | "help" | "flows";

interface SidebarProps {
  active: Module;
  onChange: (m: Module) => void;
  allowedModules: Module[];
}

const ALL_ITEMS: { id: Module; label: string; icon: string; dividerAfter?: boolean }[] = [
  { id: "master",      label: "Plataforma",   icon: "🏛️", dividerAfter: true },
  { id: "chat",        label: "Chat",         icon: "💬" },
  { id: "crm",         label: "CRM",          icon: "👥" },
  { id: "calendar",    label: "Calendario",   icon: "📅" },
  { id: "analytics",   label: "Analytics",    icon: "📊" },
  { id: "accounting",  label: "Contabilidad", icon: "💰" },
  { id: "suppliers",   label: "Proveedores",  icon: "🤝" },
  { id: "products",    label: "Productos",    icon: "🛍️" },
  { id: "campaigns",   label: "Campañas",     icon: "📧" },
  { id: "documents",   label: "Documentos",   icon: "📄" },
  { id: "settings",    label: "Ajustes",      icon: "⚙️" },
  { id: "flows",       label: "Flujos",       icon: "🔀" },
  { id: "help",        label: "Manual",       icon: "📖" },
];

export default function Sidebar({ active, onChange, allowedModules }: SidebarProps) {
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/alerts");
        if (res.ok) setAlertCount((await res.json()).count);
      } catch {}
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const visibleItems = ALL_ITEMS.filter((item) => allowedModules.includes(item.id));

  return (
    <aside className="w-16 lg:w-56 shrink-0 bg-gray-900 flex flex-col py-4 gap-1">
      <div className="px-3 mb-4 hidden lg:block">
        <span className="text-white font-bold text-sm">Agente DMC</span>
      </div>
      {visibleItems.map((item) => {
        const badge = item.id === "chat" ? alertCount : 0;
        const isMasterItem = item.id === "master";
        return (
          <div key={item.id}>
            <button
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mx-2 transition-colors text-left relative ${
                isMasterItem
                  ? active === item.id
                    ? "bg-indigo-600 text-white"
                    : "text-indigo-400 hover:bg-gray-800 hover:text-indigo-300"
                  : active === item.id
                    ? "bg-emerald-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
              style={{ width: "calc(100% - 1rem)" }}
            >
              <span className="text-lg shrink-0 relative">
                {item.icon}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className="hidden lg:block text-sm font-medium">{item.label}</span>
              {badge > 0 && (
                <span className="hidden lg:block ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {badge}
                </span>
              )}
            </button>
            {item.dividerAfter && <div className="mx-4 my-2 border-t border-gray-700" />}
          </div>
        );
      })}
    </aside>
  );
}
