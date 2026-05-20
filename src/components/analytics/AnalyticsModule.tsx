"use client";
import { useState, useEffect } from "react";

interface FunnelItem { stage: string; count: number }
interface ProductStat { name: string; sales: number; revenue: number; avg_people: number }
interface MonthlyIncome { month: string; total: number }
interface PeakHour { hour: number; count: number }
interface UpcomingRes { client_name: string | null; service_name: string | null; service_date: number; people_count: number; status: string; reservation_code: string | null }

const STAGE_LABELS: Record<string, string> = { NUEVO:"Nuevo", CALIFICADO:"Calificado", PROPUESTA:"Propuesta", NEGOCIACION:"Negociación", GANADO:"Ganado", PERDIDO:"Perdido" };
const STAGE_COLORS: Record<string, string> = { NUEVO:"bg-gray-400", CALIFICADO:"bg-blue-400", PROPUESTA:"bg-yellow-400", NEGOCIACION:"bg-orange-400", GANADO:"bg-emerald-500", PERDIDO:"bg-red-400" };
const STATUS_COLOR: Record<string, string> = { confirmed:"bg-emerald-100 text-emerald-700", pending:"bg-yellow-100 text-yellow-700", completed:"bg-gray-100 text-gray-500", cancelled:"bg-red-100 text-red-600" };
const STATUS_LABEL: Record<string, string> = { confirmed:"Confirmada", pending:"Pendiente", completed:"Completada", cancelled:"Cancelada" };

function fmt(n: number) { return `$${n.toLocaleString("es-CO")} COP`; }
function fmtDate(ts: number) { return new Date(ts * 1000).toLocaleDateString("es-CO", { day:"2-digit", month:"short" }); }

function KPI({ label, value, sub, color = "text-gray-800" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AnalyticsModule() {
  const [data, setData] = useState<{
    funnel: FunnelItem[]; conversionRate: number; totalDeals: number; wonDeals: number;
    byProduct: ProductStat[]; monthlyIncome: MonthlyIncome[];
    avgCloseTimeDays: number; totalConversations: number; activeToday: number;
    totalIncome: number; thisMonthIncome: number;
    reservations: { total: number; confirmed: number; pending: number; completed: number };
    upcomingReservations: UpcomingRes[];
    peakHours: PeakHour[]; msgsToday: number; botResponseRate: number;
  } | null>(null);

  useEffect(() => { fetch("/api/analytics").then(r => r.json()).then(setData); }, []);

  if (!data) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  const maxFunnel = Math.max(...data.funnel.map(f => f.count), 1);
  const maxInc    = Math.max(...data.monthlyIncome.map(m => m.total), 1);
  const maxHour   = Math.max(...(data.peakHours ?? []).map(h => h.count), 1);

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header resumen */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold">Analytics</h1>
            <p className="text-blue-200 text-sm mt-0.5">
              {data.totalConversations} conversaciones · {data.wonDeals} ventas cerradas · {data.reservations?.total ?? 0} reservas
            </p>
          </div>
          <div className="text-right">
            <p className="text-blue-200 text-xs uppercase tracking-wide">Ingresos este mes</p>
            <p className="text-2xl font-bold">{fmt(data.thisMonthIncome)}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-3">Ingresos y ventas</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI label="Ingresos totales"    value={fmt(data.totalIncome)}       color="text-emerald-600" />
          <KPI label="Este mes"            value={fmt(data.thisMonthIncome)}    color="text-emerald-500" />
          <KPI label="Tasa de conversión"  value={`${data.conversionRate}%`}   color={data.conversionRate >= 30 ? "text-emerald-600" : "text-orange-500"} />
          <KPI label="Tiempo prom. cierre" value={`${data.avgCloseTimeDays}d`} color="text-blue-600" />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-3">WhatsApp y conversaciones</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI label="Total conversaciones" value={String(data.totalConversations)} />
          <KPI label="Activas hoy"          value={String(data.activeToday)}        color="text-amber-600" />
          <KPI label="Mensajes hoy"         value={String(data.msgsToday)}          color="text-blue-600" />
          <KPI label="Respuesta bot <5min"  value={`${data.botResponseRate}%`}      color={data.botResponseRate >= 80 ? "text-emerald-600" : "text-orange-500"} sub="últimos 30 días" />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-3">Reservas</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPI label="Total"           value={String(data.reservations?.total ?? 0)} />
          <KPI label="Confirmadas"     value={String(data.reservations?.confirmed ?? 0)} color="text-emerald-600" />
          <KPI label="Pdte. de pago"   value={String(data.reservations?.pending ?? 0)}   color="text-yellow-600" />
          <KPI label="Completadas"     value={String(data.reservations?.completed ?? 0)} color="text-gray-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Embudo de conversión</h2>
          <div className="space-y-3">
            {data.funnel.map(f => (
              <div key={f.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{STAGE_LABELS[f.stage] ?? f.stage}</span>
                  <span className="font-semibold text-gray-800">{f.count}</span>
                </div>
                <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${STAGE_COLORS[f.stage] ?? "bg-gray-400"}`}
                    style={{ width: `${maxFunnel > 0 ? (f.count / maxFunnel) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Próximas reservas (7 días)</h2>
          {(data.upcomingReservations ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Sin reservas próximas.</p>
          ) : (
            <div className="space-y-2">
              {data.upcomingReservations.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.client_name ?? "—"}</p>
                    <p className="text-xs text-gray-400">{r.service_name ?? "Servicio"} · {r.people_count} pers.</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-gray-700">{fmtDate(r.service_date)}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLOR[r.status] ?? ""}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Ingresos por mes (últimos 6)</h2>
          {data.monthlyIncome.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Sin datos aún.</p>
          ) : (
            <div className="space-y-2">
              {data.monthlyIncome.map(m => (
                <div key={m.month}>
                  <div className="flex justify-between text-sm mb-0.5">
                    <span className="text-gray-600">{m.month}</span>
                    <span className="font-semibold text-emerald-600">{fmt(m.total)}</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(m.total / maxInc) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Horas pico de mensajes</h2>
          <p className="text-xs text-gray-400 mb-4">Últimos 30 días · Hora Colombia</p>
          {(data.peakHours ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Sin datos suficientes.</p>
          ) : (
            <div className="flex items-end gap-0.5 h-20">
              {Array.from({ length: 24 }, (_, h) => {
                const found = (data.peakHours ?? []).find(p => p.hour === h);
                const count = found?.count ?? 0;
                const pct   = maxHour > 0 ? (count / maxHour) * 100 : 0;
                const isHigh = count >= maxHour * 0.7;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${h}:00 — ${count} mensajes`}>
                    <div className="w-full rounded-sm" style={{ height: `${Math.max(pct, 3)}%`, background: isHigh ? "#10b981" : "#d1fae5" }} />
                    {h % 6 === 0 && <span className="text-[8px] text-gray-400 leading-none">{h}h</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-800 mb-4">Rentabilidad por producto / servicio</h2>
          {data.byProduct.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Sin ventas aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-gray-400 text-xs uppercase">
                  <th className="text-left py-2">Producto</th>
                  <th className="text-right py-2">Ventas</th>
                  <th className="text-right py-2">Ingresos</th>
                  <th className="text-right py-2">Prom. personas</th>
                </tr></thead>
                <tbody>
                  {data.byProduct.map(p => (
                    <tr key={p.name} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 font-medium text-gray-800">{p.name}</td>
                      <td className="py-2 text-right text-gray-600">{p.sales}</td>
                      <td className="py-2 text-right font-semibold text-emerald-600">{fmt(p.revenue)}</td>
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
