"use client";

import { useState, useEffect } from "react";

interface SlaBreachItem { id: number; phone: string; name: string | null; last_user_at: number }

interface DashboardHeaderProps {
  phone: string | null;
  onDisconnect: () => void;
  currentUser?: { name: string; role?: string; isMaster?: boolean } | null;
  onLogout?: () => void;
  onMenuOpen?: () => void;
}

export default function DashboardHeader({ phone, onDisconnect, currentUser, onLogout, onMenuOpen }: DashboardHeaderProps) {
  const [slaBreaches, setSlaBreaches] = useState(0);
  const [showSla, setShowSla]         = useState(false);
  const [slaList, setSlaList]         = useState<SlaBreachItem[]>([]);
  const [subDays, setSubDays]         = useState<number | null>(null);
  const [companyName, setCompanyName] = useState("Aivox");

  // Cambio de contraseña propio
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm]           = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg]             = useState<{ ok: boolean; text: string } | null>(null);
  const [pwSaving, setPwSaving]       = useState(false);

  async function handleChangePw() {
    if (pwForm.next.length < 6) { setPwMsg({ ok: false, text: "Mínimo 6 caracteres" }); return; }
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ ok: false, text: "Las contraseñas no coinciden" }); return; }
    setPwSaving(true); setPwMsg(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
    });
    const d = await res.json() as { ok?: boolean; error?: string };
    setPwSaving(false);
    if (d.ok) { setPwMsg({ ok: true, text: "✅ Contraseña actualizada" }); setPwForm({ current: "", next: "", confirm: "" }); setTimeout(() => setShowPwModal(false), 1500); }
    else setPwMsg({ ok: false, text: d.error ?? "Error al cambiar" });
  }

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
    async function checkSub() {
      if (currentUser?.isMaster) return; // master no necesita alerta de suscripción
      try {
        const res = await fetch("/api/subscription");
        if (!res.ok) return;
        const d = await res.json() as { daysLeft: number | null; isPermanent: boolean };
        if (!d.isPermanent) setSubDays(d.daysLeft);
      } catch {}
    }
    async function fetchCompanyName() {
      if (currentUser?.isMaster) return;
      try {
        const d = await fetch("/api/settings/company").then(r => r.json()) as { config?: { name?: string | null } };
        if (d.config?.name) setCompanyName(d.config.name);
      } catch {}
    }
    checkSla(); checkSub(); fetchCompanyName();
    const iv = setInterval(() => { checkSla(); checkSub(); }, 60000);
    return () => clearInterval(iv);
  }, [currentUser]);

  async function handleDisconnect() {
    if (!confirm("¿Desconectar el número? Tendrás que escanear el QR nuevamente.")) return;
    await fetch("/api/connection/disconnect", { method: "POST" });
    onDisconnect();
  }

  return (
    <header className="flex items-center justify-between px-3 md:px-6 py-3 bg-white border-b border-gray-200 shrink-0 relative">
      <div className="flex items-center gap-2">
        {/* Hamburguesa en móvil */}
        <button onClick={onMenuOpen} className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 mr-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="font-semibold text-gray-800 text-sm truncate max-w-[120px] md:max-w-none">{companyName}</span>
        {phone && <span className="hidden sm:inline text-xs md:text-sm text-gray-400 shrink-0">+{phone}</span>}
      </div>
      <div className="flex items-center gap-4">
        {/* Alerta de vencimiento de suscripción */}
        {subDays !== null && subDays <= 30 && (
          <a href="#" onClick={e => { e.preventDefault(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
              subDays <= 3 ? "bg-red-50 border-red-200 text-red-700 animate-pulse"
              : subDays <= 7 ? "bg-orange-50 border-orange-200 text-orange-700"
              : "bg-yellow-50 border-yellow-200 text-yellow-700"
            }`}>
            💳 {subDays <= 0 ? "¡Plan vencido!" : `Plan vence en ${subDays}d`}
          </a>
        )}

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
            <button
              onClick={() => { setShowPwModal(true); setPwMsg(null); setPwForm({ current: "", next: "", confirm: "" }); }}
              className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
              title="Cambiar contraseña"
            >
              {currentUser.name[0].toUpperCase()}
            </button>
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

      {/* Modal cambio de contraseña propio */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">🔑 Cambiar mi contraseña</h3>
              <button onClick={() => setShowPwModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Contraseña actual</label>
                <input type="password" value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                  placeholder="••••••••" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nueva contraseña</label>
                <input type="password" value={pwForm.next} onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                  placeholder="Mínimo 6 caracteres" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Confirmar nueva contraseña</label>
                <input type="password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                  placeholder="Repite la contraseña" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>
            {pwMsg && (
              <p className={`text-sm rounded-lg px-3 py-2 ${pwMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{pwMsg.text}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowPwModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={handleChangePw} disabled={pwSaving || !pwForm.next || !pwForm.confirm}
                className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50">
                {pwSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
