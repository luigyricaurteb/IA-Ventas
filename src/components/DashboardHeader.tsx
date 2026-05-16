"use client";

import { useState, useEffect } from "react";

interface SlaBreachItem { id: number; phone: string; name: string | null; last_user_at: number }

interface DashboardHeaderProps {
  phone: string | null;
  onDisconnect: () => void;
  currentUser?: { name: string; role?: string } | null;
  onLogout?: () => void;
}

export default function DashboardHeader({ phone, onDisconnect, currentUser, onLogout }: DashboardHeaderProps) {
  const [slaBreaches, setSlaBreaches] = useState(0);
  const [showSla, setShowSla] = useState(false);
  const [slaList, setSlaList] = useState<SlaBreachItem[]>([]);

  useEffect(() => {
    async function checkSla() {
      try {
        const res = await fetch("/api/sla");
        if (!res.ok) return;
        const d = await res.json() as { breaches: SlaBreachItem[] };
        setSlaBreaches(d.breaches?.length ?? 0);
        setSlaList(d.breaches ?? []);
      } catch {}
    }
    checkSla();
    const iv = setInterval(checkSla, 30000);
    return () => clearInterval(iv);
  }, []);

  async function handleDisconnect() {
    if (!confirm("¿Desconectar el número? Tendrás que escanear el QR nuevamente.")) return;
    await fetch("/api/connection/disconnect", { method: "POST" });
    onDisconnect();
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0 relative">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="font-semibold text-gray-800">Agente DMC</span>
        {phone && <span className="text-sm text-gray-400 ml-2">+{phone}</span>}
      </div>
      <div className="flex items-center gap-4">
        {/* SLA Alert */}
        {slaBreaches > 0 && (
          <div className="relative">
            <button onClick={() => setShowSla(v => !v)}
              className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 animate-pulse">
              ⏰ {slaBreaches} sin responder
            </button>
            {showSla && (
              <div className="absolute right-0 top-10 bg-white border rounded-xl shadow-xl w-72 z-50 p-3">
                <p className="text-xs font-semibold text-red-700 mb-2">Conversaciones fuera de SLA</p>
                {slaList.map(b => (
                  <div key={b.id} className="py-1.5 border-b last:border-b-0">
                    <p className="text-xs font-medium text-gray-800">{b.name ?? b.phone}</p>
                    <p className="text-xs text-red-500">Sin respuesta desde {Math.round((Date.now()/1000 - b.last_user_at)/60)} min</p>
                  </div>
                ))}
                <button onClick={() => setShowSla(false)} className="mt-2 text-xs text-gray-400 w-full text-center">Cerrar</button>
              </div>
            )}
          </div>
        )}

        {currentUser && (
          <div className="hidden md:flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
              {currentUser.name[0].toUpperCase()}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700 leading-none">{currentUser.name}</p>
              <p className="text-xs text-gray-400 capitalize">{currentUser.role}</p>
            </div>
          </div>
        )}
        <button onClick={handleDisconnect} className="text-sm text-gray-400 hover:text-red-500 transition-colors">WA Off</button>
        {onLogout && (
          <button onClick={onLogout} className="text-sm text-red-500 hover:text-red-700 transition-colors font-medium">Salir</button>
        )}
      </div>
    </header>
  );
}
