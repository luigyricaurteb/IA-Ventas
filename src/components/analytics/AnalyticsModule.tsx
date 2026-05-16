"use client";
import { useState, useEffect } from "react";

interface FunnelItem { stage: string; count: number }
interface ProductStat { name: string; sales: number; revenue: number; avg_people: number }
interface MonthlyIncome { month: string; total: number }

const STAGE_LABELS: Record<string, string> = {
  NUEVO: "Nuevo", CALIFICADO: "Calificado", PROPUESTA: "Propuesta",
  NEGOCIACION: "Negociación", GANADO: "Ganado", PERDIDO: "Perdido",
};
const STAGE_COLORS: Record<string, string> = {
  NUEVO: "bg-gray-400", CALIFICADO: "bg-blue-400", PROPUESTA: "bg-yellow-400",
  NEGOCIACION: "bg-orange-400", GANADO: "bg-emerald-500", PERDIDO: "bg-red-400",
};

function fmt(n: number) { return n.toLocaleString("es-CO", { minimumFractionDigits: 0 }); }

export default function AnalyticsModule() {
  const [data, setData] = useState<{
    funnel: FunnelItem[]; conversionRate: number; totalDeals: number; wonDeals: number;
    byProduct: ProductStat[]; monthlyIncome: MonthlyIncome[];
    avgCloseTimeDays: number; totalConversations: number; activeToday: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/analytics").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" /></div>;

  const maxCount = Math.max(...data.funnel.map((f) => f.count), 1);

  return (
    <div className="flex-1 overflow-auto p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Analytics</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Conversión total",    value: `${data.conversionRate}%`,      color: "text-emerald-600" },
          { label: "Negocios totales",    value: String(data.totalDeals),         color: "text-gray-800" },
          { label: "Ganados",             value: String(data.wonDeals),           color: "text-emerald-600" },
          { label: "Tiempo prom. cierre", value: `${data.avgCloseTimeDays}d`,     color: "text-blue-600" },
          { label: "Conversaciones",      value: String(data.totalConversations), color: "text-gray-800" },
          { label: "Activas hoy",         value: String(data.activeToday),        color: "text-amber-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Embudo */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Embudo de conversión</h2>
          <div className="space-y-3">
            {data.funnel.map((f) => (
              <div key={f.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{STAGE_LABELS[f.stage] ?? f.stage}</span>
                  <span className="font-semibold text-gray-800">{f.count}</span>
                </div>
                <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${STAGE_COLORS[f.stage] ?? "bg-gray-400"}`}
                    style={{ width: `${maxCount > 0 ? (f.count / maxCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ingresos por mes */}
        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ingresos últimos 6 meses</h2>
          {data.monthlyIncome.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Sin datos de ingresos aún.</p>
          ) : (
            <div className="space-y-2">
              {(() => {
                const maxInc = Math.max(...data.monthlyIncome.map((m) => m.total), 1);
                return data.monthlyIncome.map((m) => (
                  <div key={m.month}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-600">{m.month}</span>
                      <span className="font-semibold text-emerald-600">${fmt(m.total)}</span>
                    </div>
                    <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(m.total / maxInc) * 100}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Rentabilidad por producto */}
        <div className="bg-white border rounded-xl p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-800 mb-4">Rentabilidad por producto</h2>
          {data.byProduct.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Sin ventas registradas aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-gray-400 text-xs uppercase">
                  <th className="text-left py-2">Producto</th>
                  <th className="text-right py-2">Ventas</th>
                  <th className="text-right py-2">Ingresos</th>
                  <th className="text-right py-2">Personas prom.</th>
                </tr></thead>
                <tbody>
                  {data.byProduct.map((p) => (
                    <tr key={p.name} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 font-medium text-gray-800">{p.name}</td>
                      <td className="py-2 text-right text-gray-600">{p.sales}</td>
                      <td className="py-2 text-right font-semibold text-emerald-600">${fmt(p.revenue)}</td>
                      <td className="py-2 text-right text-gray-600">{Math.round(p.avg_people)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
