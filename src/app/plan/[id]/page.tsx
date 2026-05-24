"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const MODULE_LABELS: Record<string, string> = {
  chat: "💬 Chat & WhatsApp IA",
  crm: "👥 CRM & Pipeline",
  calendar: "📅 Reservas & Calendario",
  accounting: "💰 Contabilidad",
  suppliers: "🤝 Proveedores",
  products: "🛍️ Productos & Catálogo",
  campaigns: "📧 Campañas Email",
  documents: "📄 Documentos",
  analytics: "📊 Analytics",
};

interface Plan {
  id: number; name: string; description: string | null;
  price_cop: number; price_usd: number; billing_cycle: string;
  max_users: number; max_wa_numbers: number; modules: Record<string, boolean>;
}

export default function PlanPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [plan, setPlan]     = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/plans")
      .then(r => r.json())
      .then((d: { plans: Plan[] }) => {
        setPlans(d.plans ?? []);
        const found = d.plans.find(p => String(p.id) === params.id);
        setPlan(found ?? null);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  if (!plan) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
      <div className="text-center">
        <div className="text-5xl mb-4">😕</div>
        <p className="text-gray-300 mb-4">Plan no encontrado</p>
        <button onClick={() => router.push("/register")}
          className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-emerald-600">
          Ver todos los planes
        </button>
      </div>
    </div>
  );

  const modules = Object.entries(plan.modules).filter(([, v]) => v).map(([k]) => k);
  const billingLabel = plan.billing_cycle === "monthly" ? "/mes" : plan.billing_cycle === "yearly" ? "/año" : " pago único";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-4 text-center">
        <div className="inline-flex items-center gap-2 mb-1">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center font-black text-sm">H</div>
          <span className="font-bold text-white">Aivox Platform</span>
        </div>
        <p className="text-gray-400 text-xs">Automatiza tu negocio con IA y WhatsApp</p>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">

        {/* Plan card */}
        <div className="bg-gradient-to-br from-emerald-900/40 to-gray-800 border border-emerald-700/50 rounded-2xl p-6">
          <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">Plan seleccionado</p>
          <h1 className="text-3xl font-bold text-white mb-1">{plan.name}</h1>
          {plan.description && <p className="text-gray-300 text-sm mb-4">{plan.description}</p>}
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-black text-white">${plan.price_cop.toLocaleString("es-CO")}</span>
            <span className="text-gray-400">COP{billingLabel}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>👥 Hasta {plan.max_users} usuarios</span>
            <span>📱 {plan.max_wa_numbers} número WA</span>
          </div>
        </div>

        {/* Módulos incluidos */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">Módulos incluidos</p>
          <div className="space-y-2">
            {modules.map(m => (
              <div key={m} className="flex items-center gap-3">
                <span className="text-emerald-400 text-sm">✓</span>
                <span className="text-gray-200 text-sm">{MODULE_LABELS[m] ?? m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <button
            onClick={() => router.push(`/register?plan=${plan.id}`)}
            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 transition-colors">
            Comenzar ahora →
          </button>
          <button
            onClick={() => router.push("/register")}
            className="w-full bg-transparent border border-gray-700 text-gray-300 py-3 rounded-2xl font-medium hover:border-gray-500 hover:text-white transition-colors text-sm">
            Ver todos los planes
          </button>
        </div>

        {/* Otros planes */}
        {plans.filter(p => p.id !== plan.id).length > 0 && (
          <div>
            <p className="text-gray-500 text-xs text-center mb-3">También disponible</p>
            <div className="grid grid-cols-1 gap-2">
              {plans.filter(p => p.id !== plan.id).map(p => (
                <button key={p.id}
                  onClick={() => router.push(`/plan/${p.id}`)}
                  className="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-xl p-3 hover:border-gray-600 transition-colors text-left">
                  <div>
                    <p className="text-gray-200 font-medium text-sm">{p.name}</p>
                    {p.description && <p className="text-gray-500 text-xs">{p.description}</p>}
                  </div>
                  <p className="text-gray-300 text-sm shrink-0 ml-3">${p.price_cop.toLocaleString("es-CO")} COP/mes</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-gray-600 text-xs">
          Sin permanencia · Cancela cuando quieras · Soporte incluido
        </p>
      </div>
    </div>
  );
}
