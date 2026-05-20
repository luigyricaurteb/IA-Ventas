"use client";

import { useState, useEffect, useCallback } from "react";

interface Reservation {
  id: number; deal_id: number | null; contact_id: number | null;
  client_name: string | null; service_name: string | null;
  service_date: number; people_count: number;
  service_price: number | null; discount: number; total_value: number | null;
  amount_paid: number; status: "pending" | "confirmed" | "completed" | "cancelled";
  notes: string | null; reservation_code: string | null;
}
interface Product { id: number; name: string; price_per_person: number; description: string | null }

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente pago", confirmed: "Confirmada",
  completed: "Completada",   cancelled: "Cancelada",
};
const STATUS_COLOR: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed: "bg-gray-100 text-gray-500 border-gray-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function fmt(n: number) { return `$${n.toLocaleString("es-CO")}`; }
function formatDate(ts: number) { return new Date(ts * 1000).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
function formatDateTime(ts: number) { return new Date(ts * 1000).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

// ── Formulario de reserva ────────────────────────────────────────────────────
interface ReservationFormProps {
  initial?: Partial<Reservation>;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}
function ReservationForm({ initial, onSave, onClose }: ReservationFormProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    client_name:   initial?.client_name  ?? "",
    service_name:  initial?.service_name ?? "",
    service_price: String(initial?.service_price ?? ""),
    service_date:  initial?.service_date
      ? new Date(initial.service_date * 1000).toISOString().slice(0, 16) : "",
    people_count:  initial?.people_count ?? 1,
    discount:      String(initial?.discount ?? 0),
    amount_paid:   String(initial?.amount_paid ?? 0),
    status:        initial?.status ?? "pending",
    notes:         initial?.notes ?? "",
  });

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(d => setProducts(d.products ?? [])).catch(() => {});
  }, []);

  function selectProduct(id: string) {
    const p = products.find(p => p.id === Number(id));
    if (!p) return;
    const price = p.price_per_person;
    const total = price * Number(form.people_count) - Number(form.discount || 0);
    setForm(f => ({ ...f, service_name: p.name, service_price: String(price) }));
    void total;
  }

  function updatePeople(n: number) {
    setForm(f => ({ ...f, people_count: n }));
  }

  const servicePrice = Number(form.service_price) || 0;
  const people = Number(form.people_count) || 1;
  const discount = Number(form.discount) || 0;
  const total = servicePrice * people - discount;
  const saldo = Math.max(0, total - Number(form.amount_paid || 0));

  function handleSave() {
    if (!form.client_name || !form.service_date) return;
    onSave({
      client_name:   form.client_name,
      service_name:  form.service_name || null,
      service_price: servicePrice || null,
      service_date:  Math.floor(new Date(form.service_date).getTime() / 1000),
      people_count:  people,
      discount,
      total_value:   servicePrice > 0 ? total : null,
      amount_paid:   Number(form.amount_paid) || 0,
      status:        form.status,
      notes:         form.notes || null,
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
          {/* Cliente */}
          <div>
            <label className="text-sm font-medium text-gray-700">Nombre del cliente *</label>
            <input value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>

          {/* Servicio — selector + texto */}
          <div>
            <label className="text-sm font-medium text-gray-700">Servicio</label>
            {products.length > 0 && (
              <select onChange={e => selectProduct(e.target.value)} defaultValue=""
                className="w-full border rounded-lg px-3 py-2 mt-1 text-sm text-gray-600 mb-1">
                <option value="">— Seleccionar del catálogo —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {fmt(p.price_per_person)}/persona
                  </option>
                ))}
              </select>
            )}
            <input value={form.service_name} onChange={e => setForm({...form, service_name: e.target.value})}
              placeholder="O escribe el nombre del servicio" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Fecha */}
          <div>
            <label className="text-sm font-medium text-gray-700">Fecha y hora del servicio *</label>
            <input type="datetime-local" value={form.service_date}
              onChange={e => setForm({...form, service_date: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>

          {/* Precio × Personas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Precio por persona (COP)</label>
              <input type="number" min={0} value={form.service_price}
                onChange={e => setForm({...form, service_price: e.target.value})}
                placeholder="0" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Personas</label>
              <input type="number" min={1} value={form.people_count}
                onChange={e => updatePeople(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
          </div>

          {/* Descuento */}
          <div>
            <label className="text-sm font-medium text-gray-700">Descuento (COP)</label>
            <input type="number" min={0} value={form.discount}
              onChange={e => setForm({...form, discount: e.target.value})}
              placeholder="0" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>

          {/* Resumen financiero */}
          {servicePrice > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm border">
              <div className="flex justify-between text-gray-600">
                <span>{fmt(servicePrice)} × {people} persona{people !== 1 ? "s" : ""}</span>
                <span>{fmt(servicePrice * people)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>Descuento</span>
                  <span>- {fmt(discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-800 border-t pt-1">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
            </div>
          )}

          {/* Abono */}
          <div>
            <label className="text-sm font-medium text-gray-700">Abono inicial (COP)</label>
            <input type="number" min={0} value={form.amount_paid}
              onChange={e => setForm({...form, amount_paid: e.target.value})}
              placeholder="0" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            {servicePrice > 0 && Number(form.amount_paid) > 0 && (
              <p className="text-xs mt-1 text-emerald-600">
                Saldo pendiente: <strong>{fmt(saldo)}</strong>
              </p>
            )}
          </div>

          {/* Estado */}
          <div>
            <label className="text-sm font-medium text-gray-700">Estado</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value as Reservation["status"]})}
              className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
              <option value="pending">Pendiente pago</option>
              <option value="confirmed">Confirmada</option>
              <option value="completed">Completada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className="text-sm font-medium text-gray-700">Notas</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              rows={2} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={!form.client_name || !form.service_date}
              className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
              {initial?.id ? "Guardar cambios" : "Crear reserva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal de pago ────────────────────────────────────────────────────────────
function PaymentModal({ reservation, onClose, onPaid }: { reservation: Reservation; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const total = reservation.total_value ?? 0;
  const paid = reservation.amount_paid ?? 0;
  const saldo = Math.max(0, total - paid);

  async function save() {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    const res = await fetch(`/api/calendar/${reservation.id}/payment`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), reference }),
    });
    const d = await res.json() as { ok: boolean; saldo: number; error?: string };
    if (d.ok) {
      setMsg(`✅ Abono registrado. Saldo pendiente: ${fmt(d.saldo)}`);
      setTimeout(() => { onPaid(); onClose(); }, 1500);
    } else {
      setMsg(`❌ ${d.error}`);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="font-bold text-gray-800">💳 Registrar pago</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{reservation.client_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Servicio</span><span className="font-medium">{reservation.service_name}</span></div>
            {total > 0 && <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-medium">{fmt(total)}</span></div>}
            {paid > 0 && <div className="flex justify-between"><span className="text-gray-500">Ya pagado</span><span className="font-medium text-emerald-600">{fmt(paid)}</span></div>}
            {saldo > 0 && <div className="flex justify-between border-t pt-1"><span className="text-gray-700 font-semibold">Saldo pendiente</span><span className="font-bold text-orange-600">{fmt(saldo)}</span></div>}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Monto del pago (COP) *</label>
            <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={saldo > 0 ? String(saldo) : "0"}
              className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Referencia / comprobante</label>
            <input value={reference} onChange={e => setReference(e.target.value)}
              placeholder="Ej: TRF-123456" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
          </div>
          {msg && <p className={`text-sm rounded-lg p-2 ${msg.startsWith("✅") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
            <button onClick={save} disabled={saving || !amount}
              className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
              {saving ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de reserva ───────────────────────────────────────────────────────
function ReservationCard({ r, onEdit, onDelete, onPay, onChange }: {
  r: Reservation; onEdit: () => void; onDelete: () => void;
  onPay: () => void; onChange: (status: string) => void;
}) {
  const total = r.total_value ?? 0;
  const paid = r.amount_paid ?? 0;
  const saldo = Math.max(0, total - paid);
  const pctPaid = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Status stripe */}
      <div className={`h-1 w-full ${r.status === "confirmed" ? "bg-emerald-400" : r.status === "pending" ? "bg-yellow-400" : r.status === "completed" ? "bg-gray-400" : "bg-red-400"}`} />
      <div className="p-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="font-semibold text-sm text-gray-800 truncate">{r.client_name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 font-medium ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
            </div>
            {r.service_name && <p className="text-xs text-blue-600 truncate font-medium">🛍️ {r.service_name}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(r.service_date)} · {r.people_count} pax</p>
            {r.reservation_code && <p className="text-[10px] text-gray-300 font-mono mt-0.5">{r.reservation_code}</p>}
          </div>
          <div className="flex flex-col gap-1 shrink-0 items-end">
            <button onClick={onEdit} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Editar</button>
            <a href={`/api/pdf/voucher/${r.id}`} target="_blank" rel="noopener" className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">PDF</a>
            {saldo > 0 && <button onClick={onPay} className="text-xs text-orange-500 hover:text-orange-700 font-medium">+ Pago</button>}
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">Borrar</button>
          </div>
        </div>

        {total > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">Total: <strong className="text-gray-800">{fmt(total)}</strong></span>
              {saldo > 0 ? (
                <span className="text-orange-600 font-semibold">Saldo: {fmt(saldo)}</span>
              ) : (
                <span className="text-emerald-600 font-semibold">Pagado completo</span>
              )}
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${pctPaid}%` }} />
            </div>
          </div>
        )}

        <div className="mt-2">
          <select value={r.status} onChange={e => onChange(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:border-blue-300">
            <option value="pending">Pendiente pago</option>
            <option value="confirmed">Confirmada</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Módulo principal ─────────────────────────────────────────────────────────
export default function CalendarModule() {
  const today = new Date();
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
  const [paying, setPaying]      = useState<Reservation | null>(null);

  const fetchMonth = useCallback(async () => {
    const res = await fetch(`/api/calendar?view=month&year=${year}&month=${month}`);
    if (res.ok) { const d = await res.json(); setReservations(d.reservations); setCountByDay(d.countByDay); }
  }, [year, month]);

  const fetchList = useCallback(async () => {
    const params = new URLSearchParams({ view: "list", page: String(listPage) });
    if (listStatus) params.set("status", listStatus);
    const res = await fetch(`/api/calendar?${params}`);
    if (res.ok) setListData(await res.json());
  }, [listPage, listStatus]);

  const refresh = useCallback(() => { view === "month" ? fetchMonth() : fetchList(); }, [view, fetchMonth, fetchList]);

  useEffect(() => { refresh(); }, [refresh]);

  async function saveReservation(data: Record<string, unknown>) {
    if (editing) {
      await fetch(`/api/calendar/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    setShowForm(false); setEditing(null);
    refresh();
  }

  async function deleteRes(id: number) {
    if (!confirm("¿Eliminar esta reserva?")) return;
    await fetch(`/api/calendar/${id}`, { method: "DELETE" });
    refresh();
  }

  async function changeStatus(id: number, status: string) {
    await fetch(`/api/calendar/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    refresh();
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayReservations = selectedDay
    ? reservations.filter(r => new Date(r.service_date * 1000).getDate() === selectedDay)
    : [];

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); setSelectedDay(null); }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); setSelectedDay(null); }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Calendario de Reservas</h1>
          <p className="text-sm text-gray-400">{listData.total || reservations.length} reservas</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setView("month")} className={`px-3 py-1 rounded text-sm font-medium ${view === "month" ? "bg-white shadow" : "text-gray-500"}`}>Mes</button>
            <button onClick={() => setView("list")} className={`px-3 py-1 rounded text-sm font-medium ${view === "list" ? "bg-white shadow" : "text-gray-500"}`}>Lista</button>
          </div>
          <a href="/api/calendar/ical" download="reservas.ics"
            className="border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            📅 iCal
          </a>
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
            + Nueva reserva
          </button>
        </div>
      </div>

      {/* Vista Mes */}
      {view === "month" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">←</button>
              <h2 className="font-semibold text-gray-800">{MONTHS[month - 1]} {year}</h2>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_SHORT.map(d => <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const count = countByDay[day] ?? 0;
                const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
                const isSelected = day === selectedDay;
                return (
                  <button key={day} onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-colors
                      ${isSelected ? "bg-emerald-500 text-white" : isToday ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"}`}>
                    <span className={`font-medium ${isSelected ? "text-white" : "text-gray-700"}`}>{day}</span>
                    {count > 0 && <span className={`text-xs font-bold ${isSelected ? "text-emerald-100" : "text-emerald-600"}`}>{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedDay && (
            <div className="w-80 border-l bg-white overflow-y-auto shrink-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-gray-800">{selectedDay} de {MONTHS[month - 1]}</h3>
                <p className="text-sm text-gray-400">{dayReservations.length} reserva{dayReservations.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="p-3 space-y-2">
                {dayReservations.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Sin reservas este día.</p>}
                {dayReservations.map(r => (
                  <ReservationCard key={r.id} r={r}
                    onEdit={() => { setEditing(r); setShowForm(true); }}
                    onDelete={() => deleteRes(r.id)}
                    onPay={() => setPaying(r)}
                    onChange={s => changeStatus(r.id, s)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vista Lista */}
      {view === "list" && (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="flex gap-3 mb-4 flex-wrap">
            {["", "pending", "confirmed", "completed", "cancelled"].map(s => (
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
            {listData.rows.map(r => {
              const total = r.total_value ?? 0;
              const paid = r.amount_paid ?? 0;
              const saldo = Math.max(0, total - paid);
              const isPast = r.service_date < Math.floor(Date.now() / 1000);
              return (
                <div key={r.id} className={`bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-opacity ${isPast && r.status !== "completed" ? "opacity-50" : ""}`}>
                  <div className={`h-1 w-full ${r.status === "confirmed" ? "bg-emerald-400" : r.status === "pending" ? "bg-yellow-400" : r.status === "completed" ? "bg-gray-400" : "bg-red-400"}`} />
                  <div className="p-4 flex items-center gap-4">
                    <div className="text-center shrink-0 w-14 bg-gray-50 rounded-xl py-2">
                      <p className="text-[10px] text-gray-400 uppercase">{new Date(r.service_date * 1000).toLocaleDateString("es-CO", { month: "short" })}</p>
                      <p className="text-2xl font-bold text-gray-800 leading-none">{new Date(r.service_date * 1000).getDate()}</p>
                      <p className="text-[10px] text-gray-400">{new Date(r.service_date * 1000).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-gray-800 truncate">{r.client_name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      </div>
                      {r.service_name && <p className="text-sm text-blue-600 truncate font-medium">🛍️ {r.service_name} · {r.people_count} pax</p>}
                      {total > 0 && (
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-sm font-bold text-gray-800">{fmt(total)}</span>
                          {paid > 0 && <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Pagado: {fmt(paid)}</span>}
                          {saldo > 0 && <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full font-bold">Saldo: {fmt(saldo)}</span>}
                        </div>
                      )}
                      {r.reservation_code && <p className="text-[10px] text-gray-300 font-mono mt-0.5">{r.reservation_code}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <button onClick={() => { setEditing(r); setShowForm(true); }} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Editar</button>
                      <a href={`/api/pdf/voucher/${r.id}`} target="_blank" rel="noopener" className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">PDF</a>
                      {saldo > 0 && <button onClick={() => setPaying(r)} className="text-xs text-orange-500 hover:text-orange-700 font-bold">+ Pago</button>}
                      <button onClick={() => deleteRes(r.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

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

      {paying && (
        <PaymentModal
          reservation={paying}
          onClose={() => setPaying(null)}
          onPaid={refresh}
        />
      )}
    </div>
  );
}
