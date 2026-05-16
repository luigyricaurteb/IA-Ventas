"use client";
import { useState, useEffect } from "react";

const MODULE_LABELS: Record<string,string> = {
  chat:"💬 Chat", crm:"👥 CRM", calendar:"📅 Calendario", accounting:"💰 Contabilidad",
  suppliers:"🤝 Proveedores", products:"🛍️ Productos", campaigns:"📧 Campañas",
  documents:"📄 Documentos", analytics:"📊 Analytics", settings:"⚙️ Ajustes",
};

interface SubData {
  company: { id: number; slug: string; name: string; status: string };
  plan: {
    id: number; name: string; description: string | null;
    price_monthly: number; billing_cycle: string;
    modules: Record<string,boolean>; max_users: number; max_wa_numbers: number;
  } | null;
  subscription: {
    id: number; status: string; starts_at: number; ends_at: number | null;
    billing_cycle: string; payment_amount: number | null;
  } | null;
  daysLeft: number | null;
  isPermanent: boolean;
  allSubscriptions: { id: number; status: string; billing_cycle: string; payment_amount: number | null; starts_at: number; ends_at: number | null }[];
}

function fmt(n: number) { return n.toLocaleString("es-CO"); }
function fmtDate(ts: number) { return new Date(ts * 1000).toLocaleDateString("es-CO", { day:"2-digit", month:"long", year:"numeric" }); }

function DaysCounter({ days, isPermanent }: { days: number | null; isPermanent: boolean }) {
  if (isPermanent) return (
    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
      <div className="text-4xl">♾️</div>
      <div>
        <p className="text-2xl font-bold text-emerald-700">Licencia permanente</p>
        <p className="text-sm text-emerald-600">Acceso de por vida, sin fecha de vencimiento</p>
      </div>
    </div>
  );

  if (days === null) return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
      <p className="text-gray-500 text-center">Sin suscripción activa</p>
    </div>
  );

  const color = days > 30 ? "emerald" : days > 7 ? "yellow" : days > 3 ? "orange" : "red";
  const colorMap: Record<string, { bg: string; border: string; text: string; num: string }> = {
    emerald: { bg:"bg-emerald-50", border:"border-emerald-200", text:"text-emerald-600", num:"text-emerald-700" },
    yellow:  { bg:"bg-yellow-50", border:"border-yellow-200", text:"text-yellow-700", num:"text-yellow-700" },
    orange:  { bg:"bg-orange-50", border:"border-orange-200", text:"text-orange-700", num:"text-orange-700" },
    red:     { bg:"bg-red-50", border:"border-red-200", text:"text-red-700", num:"text-red-700" },
  };
  const c = colorMap[color];

  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-5`}>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className={`text-5xl font-black ${c.num}`}>{days}</p>
          <p className={`text-xs font-semibold ${c.text} uppercase tracking-wide`}>días restantes</p>
        </div>
        <div className="flex-1">
          {days <= 0 && <p className={`font-bold ${c.text} text-lg`}>⚠️ Suscripción vencida</p>}
          {days > 0 && days <= 3 && <p className={`font-bold ${c.text}`}>🚨 ¡Vence muy pronto! Renueva ahora</p>}
          {days > 3 && days <= 7 && <p className={`font-bold ${c.text}`}>⚠️ Vence esta semana</p>}
          {days > 7 && days <= 30 && <p className={`font-semibold ${c.text}`}>📅 Renueva antes de que expire</p>}
          {days > 30 && <p className={`font-semibold ${c.text}`}>✅ Suscripción activa y al día</p>}
          <div className="mt-2 bg-white/60 rounded-full h-2 overflow-hidden">
            <div className={`h-full bg-current ${c.text} transition-all`} style={{ width:`${Math.min(100, Math.round(days/365*100))}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionModule() {
  const [data, setData] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscription").then(r => r.json()).then((d: SubData) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" /></div>;
  if (!data) return <div className="flex-1 flex items-center justify-center text-gray-400">Error al cargar la suscripción</div>;

  const { company, plan, subscription, daysLeft, isPermanent, allSubscriptions } = data;

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Mi Suscripción</h1>
        <p className="text-sm text-gray-400 mt-0.5">{company.name} · /{company.slug}</p>
      </div>

      {/* Contador de días */}
      <div className="mb-6">
        <DaysCounter days={daysLeft} isPermanent={isPermanent} />
      </div>

      {/* Plan actual */}
      {plan ? (
        <div className="bg-white border rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{plan.name}</h2>
              {plan.description && <p className="text-sm text-gray-500">{plan.description}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-emerald-600">${fmt(plan.price_monthly)}</p>
              <p className="text-xs text-gray-400">COP / {plan.billing_cycle === "monthly" ? "mes" : plan.billing_cycle === "yearly" ? "año" : "único"}</p>
            </div>
          </div>

          {subscription && (
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">Inicio</p>
                <p className="font-medium text-gray-700">{fmtDate(subscription.starts_at)}</p>
              </div>
              {subscription.ends_at && !isPermanent && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Vencimiento</p>
                  <p className="font-medium text-gray-700">{fmtDate(subscription.ends_at)}</p>
                </div>
              )}
              {subscription.payment_amount && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Monto pagado</p>
                  <p className="font-medium text-gray-700">${fmt(subscription.payment_amount)} COP</p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Módulos incluidos</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(MODULE_LABELS).map(([id, label]) => (
                <div key={id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${plan.modules[id] ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-400 line-through"}`}>
                  <span>{plan.modules[id] ? "✓" : "✗"}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3 text-xs text-gray-500">
            <span>👥 Hasta {plan.max_users === 999 ? "∞" : plan.max_users} usuarios</span>
            <span>📱 {plan.max_wa_numbers} número{plan.max_wa_numbers !== 1 ? "s" : ""} WhatsApp</span>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 mb-4">
          <p className="text-yellow-700 font-medium">Sin plan asignado</p>
          <p className="text-yellow-600 text-sm mt-1">Contacta al administrador de la plataforma para asignar un plan a tu empresa.</p>
        </div>
      )}

      {/* Estado de la empresa */}
      {company.status === "suspended" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <p className="text-red-700 font-semibold">🚫 Cuenta suspendida</p>
          <p className="text-red-600 text-sm mt-1">Tu cuenta ha sido suspendida. Contacta al administrador para reactivarla.</p>
        </div>
      )}

      {/* Historial de pagos */}
      {allSubscriptions.length > 0 && (
        <div className="bg-white border rounded-2xl p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Historial de suscripciones</h3>
          <div className="space-y-2">
            {allSubscriptions.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : s.status === "expired" ? "bg-gray-100 text-gray-500" : "bg-yellow-100 text-yellow-700"}`}>
                    {s.status}
                  </span>
                  <span className="text-xs text-gray-500">{fmtDate(s.starts_at)}{s.ends_at ? ` → ${fmtDate(s.ends_at)}` : ""}</span>
                </div>
                {s.payment_amount && <span className="text-xs font-medium text-gray-700">${fmt(s.payment_amount)} COP</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
