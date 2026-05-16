"use client";

import { useState, useEffect, useCallback } from "react";

interface Reservation {
  id: number; deal_id: number | null; contact_id: number | null;
  client_name: string | null; service_name: string | null;
  service_date: number; people_count: number; total_value: number | null;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  notes: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pendiente pago", confirmed: "Confirmada",
  completed: "Completada",     cancelled: "Cancelada",
};
const STATUS_COLOR: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-gray-100 text-gray-500 border-gray-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(ts: number) {
  return new Date(ts * 1000).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface ReservationFormProps {
  initial?: Partial<Reservation>;
  onSave: (data: Partial<Reservation>) => void;
  onClose: () => void;
}
function ReservationForm({ initial, onSave, onClose }: ReservationFormProps) {
  const [form, setForm] = useState({
    client_name:  initial?.client_name  ?? "",
    service_name: initial?.service_name ?? "",
    service_date: initial?.service_date
      ? new Date(initial.service_date * 1000).toISOString().slice(0, 16)
      : "",
    people_count: initial?.people_count ?? 1,
    total_value:  initial?.total_value  ?? "",
    status:       initial?.status       ?? "confirmed",
    notes:        initial?.notes        ?? "",
  });

  function handleSave() {
    if (!form.client_name || !form.service_date) return;
    onSave({
      ...form,
      service_date: Math.floor(new Date(form.service_date).getTime() / 1000),
      people_count: Number(form.people_count),
      total_value:  form.total_value ? Number(form.total_value) : null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="font-bold text-gray-800">{initial?.id ? "Editar reserva" : "Nueva reserva"}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Nombre del cliente *</label>
              <input value={form.client_name} onChange={(e) => setForm({...form, client_name: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Servicio</label>
              <input value={form.service_name} onChange={(e) => setForm({...form, service_name: e.target.value})} placeholder="Ej: Tour Cartagena" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Fecha y hora del servicio *</label>
              <input type="datetime-local" value={form.service_date} onChange={(e) => setForm({...form, service_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Personas</label>
              <input type="number" min={1} value={form.people_count} onChange={(e) => setForm({...form, people_count: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Valor total</label>
              <input type="number" value={form.total_value} onChange={(e) => setForm({...form, total_value: e.target.value})} placeholder="COP" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Estado</label>
              <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value as Reservation["status"]})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                <option value="pending">Pendiente pago</option>
                <option value="confirmed">Confirmada</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Notas</label>
              <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={2} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm resize-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={!form.client_name || !form.service_date} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
              {initial?.id ? "Guardar cambios" : "Crear reserva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalendarModule() {
  const today   = new Date();
  const [view, setView]         = useState<"month" | "list">("month");
  const [year, setYear]         = useState(today.getFullYear());
  const [month, setMonth]       = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [countByDay, setCountByDay]     = useState<Record<number, number>>({});
  const [listData, setListData]  = useState<{ rows: Reservation[]; total: number }>({ rows: [], total: 0 });
  const [listPage, setListPage]  = useState(0);
  const [listStatus, setListStatus] = useState<string>("");
  const [showForm, setShowForm]  = useState(false);
  const [editing, setEditing]    = useState<Reservation | null>(null);

  const fetchMonth = useCallback(async () => {
    const res = await fetch(`/api/calendar?view=month&year=${year}&month=${month}`);
    if (res.ok) {
      const d = await res.json();
      setReservations(d.reservations);
      setCountByDay(d.countByDay);
    }
  }, [year, month]);

  const fetchList = useCallback(async () => {
    const params = new URLSearchParams({ view: "list", page: String(listPage) });
    if (listStatus) params.set("status", listStatus);
    const res = await fetch(`/api/calendar?${params}`);
    if (res.ok) setListData(await res.json());
  }, [listPage, listStatus]);

  useEffect(() => { if (view === "month") fetchMonth(); else fetchList(); }, [view, fetchMonth, fetchList]);

  async function saveReservation(data: Partial<Reservation>) {
    if (editing) {
      await fetch(`/api/calendar/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    setShowForm(false); setEditing(null);
    view === "month" ? fetchMonth() : fetchList();
  }

  async function deleteRes(id: number) {
    if (!confirm("¿Eliminar esta reserva?")) return;
    await fetch(`/api/calendar/${id}`, { method: "DELETE" });
    view === "month" ? fetchMonth() : fetchList();
  }

  async function changeStatus(id: number, status: string) {
    await fetch(`/api/calendar/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    view === "month" ? fetchMonth() : fetchList();
  }

  // Calcular días del mes para el grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const dayReservations = selectedDay
    ? reservations.filter((r) => {
        const d = new Date(r.service_date * 1000).getDate();
        return d === selectedDay;
      })
    : [];

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); setSelectedDay(null); }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); setSelectedDay(null); }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Calendario de Reservas</h1>
          <p className="text-sm text-gray-400">{listData.total || reservations.length} reservas</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView("month")} className={`px-3 py-1 rounded text-sm font-medium ${view === "month" ? "bg-white shadow" : "text-gray-500"}`}>Mes</button>
            <button onClick={() => setView("list")} className={`px-3 py-1 rounded text-sm font-medium ${view === "list" ? "bg-white shadow" : "text-gray-500"}`}>Lista</button>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">+ Nueva reserva</button>
        </div>
      </div>

      {/* Vista Mes */}
      {view === "month" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            {/* Navegación */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
              <h2 className="font-semibold text-gray-800">{MONTHS[month - 1]} {year}</h2>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">→</button>
            </div>
            {/* Grid días */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_SHORT.map((d) => <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const count = countByDay[day] ?? 0;
                const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
                const isSelected = day === selectedDay;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-colors relative
                      ${isSelected ? "bg-emerald-500 text-white" : isToday ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"}
                    `}
                  >
                    <span className={`font-medium ${isSelected ? "text-white" : "text-gray-700"}`}>{day}</span>
                    {count > 0 && (
                      <span className={`text-xs font-bold ${isSelected ? "text-emerald-100" : "text-emerald-600"}`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel lateral del día */}
          {selectedDay && (
            <div className="w-80 border-l bg-white overflow-y-auto shrink-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-800">{selectedDay} de {MONTHS[month - 1]}</h3>
                <p className="text-sm text-gray-400">{dayReservations.length} reserva{dayReservations.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="p-3 space-y-2">
                {dayReservations.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Sin reservas este día.</p>}
                {dayReservations.map((r) => (
                  <div key={r.id} className={`border rounded-xl p-3 ${STATUS_COLOR[r.status]}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{r.client_name}</p>
                        {r.service_name && <p className="text-xs opacity-75">{r.service_name}</p>}
                        <p className="text-xs opacity-60 mt-0.5">{formatDateTime(r.service_date)} · {r.people_count} pax</p>
                        {r.total_value && <p className="text-xs font-bold mt-0.5">${r.total_value.toLocaleString("es-CO")}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => { setEditing(r); setShowForm(true); }} className="text-xs text-blue-500 hover:text-blue-700">Editar</button>
                        <a href={`/api/pdf/voucher/${r.id}`} target="_blank" rel="noopener" className="text-xs text-emerald-600 hover:text-emerald-800">PDF</a>
                        <button onClick={() => deleteRes(r.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <select value={r.status} onChange={(e) => changeStatus(r.id, e.target.value)} className="w-full text-xs border rounded px-2 py-1 bg-white/50">
                        <option value="pending">Pendiente pago</option>
                        <option value="confirmed">Confirmada</option>
                        <option value="completed">Completada</option>
                        <option value="cancelled">Cancelada</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vista Lista */}
      {view === "list" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="flex gap-3 mb-4 flex-wrap">
            {["", "pending", "confirmed", "completed", "cancelled"].map((s) => (
              <button key={s} onClick={() => { setListStatus(s); setListPage(0); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  listStatus === s ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}>
                {s === "" ? "Todas" : STATUS_LABEL[s]}
              </button>
            ))}
            <span className="ml-auto text-sm text-gray-400 self-center">{listData.total} reservas</span>
          </div>

          <div className="space-y-2">
            {listData.rows.map((r) => {
              const isPast = r.service_date < Math.floor(Date.now() / 1000);
              return (
                <div key={r.id} className={`bg-white border rounded-xl p-4 flex items-center gap-4 ${isPast && r.status !== "completed" ? "opacity-60" : ""}`}>
                  <div className="text-center shrink-0 w-14">
                    <p className="text-xs text-gray-400">{new Date(r.service_date * 1000).toLocaleDateString("es-CO", { month: "short" })}</p>
                    <p className="text-2xl font-bold text-gray-800 leading-none">{new Date(r.service_date * 1000).getDate()}</p>
                    <p className="text-xs text-gray-400">{new Date(r.service_date * 1000).getFullYear()}</p>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{r.client_name}</p>
                    <p className="text-sm text-gray-500">{r.service_name} · {r.people_count} pax</p>
                    {r.total_value && <p className="text-sm text-emerald-600 font-semibold">${r.total_value.toLocaleString("es-CO")}</p>}
                    {r.notes && <p className="text-xs text-gray-400 mt-0.5">{r.notes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_COLOR[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditing(r); setShowForm(true); }} className="text-xs text-blue-500 hover:text-blue-700">Editar</button>
                      <a href={`/api/pdf/voucher/${r.id}`} target="_blank" rel="noopener" className="text-xs text-emerald-600 hover:text-emerald-800">PDF</a>
                      <button onClick={() => deleteRes(r.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          {listData.total > 50 && (
            <div className="flex gap-2 justify-center mt-6">
              <button disabled={listPage === 0} onClick={() => setListPage(p => p - 1)} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40">← Anterior</button>
              <span className="px-4 py-2 text-sm text-gray-500">Pág. {listPage + 1} de {Math.ceil(listData.total / 50)}</span>
              <button disabled={(listPage + 1) * 50 >= listData.total} onClick={() => setListPage(p => p + 1)} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40">Siguiente →</button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <ReservationForm
          initial={editing ?? undefined}
          onSave={saveReservation}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
