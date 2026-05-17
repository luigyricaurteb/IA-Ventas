"use client";
import { useState, useEffect, useCallback } from "react";

type Tab = "income" | "expenses";

interface Income {
  id: number; client_name: string | null; service_name: string | null;
  amount: number; currency: string; income_date: number; notes: string | null;
  payment_type: string | null; balance_remaining: number | null;
  reservation_code: string | null; paid_total: number | null; proof_id: number | null;
  proof_filename: string | null; proof_bank: string | null;
  proof_payer: string | null; proof_reference: string | null;
}
interface Expense {
  id: number; supplier_name: string | null; category: string;
  description: string; amount: number; currency: string; expense_date: number;
}
interface Supplier { id: number; name: string }
interface Reservation { id: number; client_name: string | null; service_name: string | null; reservation_code: string | null }
interface Summary { total_income: number; total_expense: number; margin: number }
interface Totals { total_full: number; total_partial: number; total_all: number }

const CATEGORIES = ["general","transporte","alojamiento","alimentación","guía","entrada","logística","marketing","otro"];

function fmt(n: number) { return (n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 0 }); }
function fmtDate(ts: number) { return new Date((ts ?? 0) * 1000).toLocaleDateString("es-CO"); }

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  full:    { label: "Pago completo", color: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Abono",         color: "bg-amber-100 text-amber-700" },
  manual:  { label: "Manual",        color: "bg-blue-100 text-blue-700" },
};

export default function AccountingModule() {
  const [tab, setTab]         = useState<Tab>("income");
  const [summary, setSummary] = useState<Summary>({ total_income: 0, total_expense: 0, margin: 0 });

  // Income
  const [income, setIncome]       = useState<Income[]>([]);
  const [totals, setTotals]       = useState<Totals>({ total_full: 0, total_partial: 0, total_all: 0 });
  const [searchQ, setSearchQ]     = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo]   = useState("");

  // Expenses
  const [expenses, setExpenses]           = useState<Expense[]>([]);
  const [suppliers, setSuppliers]         = useState<Supplier[]>([]);
  const [reservations, setReservations]   = useState<Reservation[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm]   = useState(false);
  const [expForm, setExpForm] = useState({ supplier_id:"", reservation_id:"", category:"general", description:"", amount:"", expense_date: new Date().toISOString().slice(0,10) });
  const [incForm, setIncForm] = useState({ client_name:"", service_name:"", amount:"", notes:"", income_date: new Date().toISOString().slice(0,10), reservation_code:"" });

  const fetchSummary = useCallback(async () => {
    try {
      const r = await fetch("/api/accounting/summary");
      const d = await r.json() as { summary?: { total_income?: number; total_expense?: number; margin?: number; totalIncome?: number; totalExpenses?: number; netProfit?: number } };
      const s = d.summary ?? {};
      setSummary({
        total_income:  s.total_income  ?? s.totalIncome  ?? 0,
        total_expense: s.total_expense ?? s.totalExpenses ?? 0,
        margin:        s.margin        ?? s.netProfit     ?? 0,
      });
    } catch {}
  }, []);

  const fetchIncome = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQ)     params.set("q", searchQ);
      if (filterType)  params.set("type", filterType);
      if (filterFrom)  params.set("from", filterFrom);
      if (filterTo)    params.set("to", filterTo);
      const r = await fetch(`/api/accounting/income?${params}`);
      const d = await r.json() as { income: Income[]; totals: Totals };
      setIncome(d.income ?? []);
      setTotals(d.totals ?? { total_full: 0, total_partial: 0, total_all: 0 });
    } catch {}
  }, [searchQ, filterType, filterFrom, filterTo]);

  const fetchExpenses = useCallback(async () => {
    try {
      const [e, s, res] = await Promise.all([
        fetch("/api/accounting/expenses").then(r => r.json()).catch(() => ({})),
        fetch("/api/suppliers").then(r => r.json()).catch(() => ({})),
        fetch("/api/calendar?view=list&page=0").then(r => r.json()).catch(() => ({})),
      ]);
      setExpenses(e.expenses ?? []);
      setSuppliers(s.suppliers ?? []);
      setReservations(res.rows ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchIncome(); }, [fetchIncome]);
  useEffect(() => { if (tab === "expenses") fetchExpenses(); }, [tab, fetchExpenses]);

  async function addExpense() {
    if (!expForm.description || !expForm.amount) return;
    await fetch("/api/accounting/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...expForm,
        supplier_id:    expForm.supplier_id    ? Number(expForm.supplier_id)    : null,
        reservation_id: expForm.reservation_id ? Number(expForm.reservation_id) : null,
        amount:         Number(expForm.amount),
        expense_date:   Math.floor(new Date(expForm.expense_date).getTime() / 1000),
      }),
    });
    setShowExpenseForm(false);
    setExpForm({ supplier_id:"", reservation_id:"", category:"general", description:"", amount:"", expense_date: new Date().toISOString().slice(0,10) });
    fetchExpenses(); fetchSummary();
  }

  async function addIncomeManual() {
    if (!incForm.amount) return;
    await fetch("/api/accounting/income", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...incForm, amount: Number(incForm.amount) }),
    });
    setShowIncomeForm(false);
    setIncForm({ client_name:"", service_name:"", amount:"", notes:"", income_date: new Date().toISOString().slice(0,10), reservation_code:"" });
    fetchIncome(); fetchSummary();
  }

  async function deleteExp(id: number) {
    await fetch(`/api/accounting/expenses/${id}`, { method: "DELETE" });
    fetchExpenses(); fetchSummary();
  }

  const marginPct = summary.total_income > 0 ? Math.round((summary.margin / summary.total_income) * 100) : 0;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">Contabilidad</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-xs text-emerald-600 font-medium uppercase">Ingresos totales</p>
          <p className="text-xl font-bold text-emerald-700">${fmt(summary.total_income)}</p>
          <p className="text-xs text-emerald-400">COP</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-xs text-red-600 font-medium uppercase">Egresos totales</p>
          <p className="text-xl font-bold text-red-700">${fmt(summary.total_expense)}</p>
          <p className="text-xs text-red-400">COP</p>
        </div>
        <div className={`border rounded-xl p-3 ${summary.margin >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
          <p className={`text-xs font-medium uppercase ${summary.margin >= 0 ? "text-blue-600" : "text-orange-600"}`}>Margen bruto</p>
          <p className={`text-xl font-bold ${summary.margin >= 0 ? "text-blue-700" : "text-orange-700"}`}>${fmt(summary.margin)}</p>
          <p className={`text-xs ${summary.margin >= 0 ? "text-blue-400" : "text-orange-400"}`}>{marginPct}% del ingreso</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-600 font-medium uppercase">Abonos</p>
          <p className="text-xl font-bold text-amber-700">${fmt(totals.total_partial)}</p>
          <p className="text-xs text-amber-400">de ${fmt(totals.total_all)} total</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        {(["income","expenses"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "income" ? "💰 Ingresos" : "📤 Egresos"}
          </button>
        ))}
      </div>

      {/* ── INGRESOS ── */}
      {tab === "income" && (
        <div>
          {/* Filtros */}
          <div className="bg-white border rounded-xl p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">Buscar</label>
                <input
                  value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="Cliente, servicio, reserva..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tipo de pago</label>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Todos</option>
                  <option value="full">Pago completo</option>
                  <option value="partial">Abono</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Desde</label>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Hasta</label>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => { setSearchQ(""); setFilterType(""); setFilterFrom(""); setFilterTo(""); }}
                className="text-xs text-gray-400 hover:text-gray-600">✕ Limpiar filtros</button>
              <span className="text-xs text-gray-400">{income.length} registro{income.length !== 1 ? "s" : ""}</span>
              <button onClick={() => setShowIncomeForm(true)}
                className="ml-auto text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600">
                + Ingreso manual
              </button>
            </div>
          </div>

          {/* Lista de ingresos */}
          <div className="space-y-2">
            {income.length === 0 && (
              <div className="bg-white border rounded-xl py-10 text-center text-gray-400 text-sm">
                <p className="text-3xl mb-2">💰</p>
                <p>Sin ingresos registrados.</p>
                <p className="text-xs mt-1">Los ingresos se generan automáticamente al aprobar pagos.</p>
              </div>
            )}
            {income.map(i => {
              const typeInfo = TYPE_LABEL[i.payment_type ?? "manual"] ?? TYPE_LABEL.manual;
              const isImage  = /\.(jpg|jpeg|png|webp)$/i.test(i.proof_filename ?? "");
              return (
                <div key={i.id} className="bg-white border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Fila 1: tipo + monto */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        {i.reservation_code && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                            {i.reservation_code}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{fmtDate(i.income_date)}</span>
                      </div>
                      {/* Fila 2: cliente y servicio */}
                      <p className="font-semibold text-gray-800 text-sm truncate">
                        {i.client_name ?? "Cliente sin nombre"} — {i.service_name ?? "Servicio"}
                      </p>
                      {/* Fila 3: detalles del comprobante */}
                      <div className="flex gap-3 flex-wrap mt-1 text-xs text-gray-500">
                        {i.proof_bank      && <span>🏦 {i.proof_bank}</span>}
                        {i.proof_payer     && <span>👤 {i.proof_payer}</span>}
                        {i.proof_reference && <span>🔖 {i.proof_reference}</span>}
                        {i.balance_remaining !== null && i.balance_remaining > 0 && (
                          <span className="text-amber-600 font-medium">⚠️ Saldo: ${fmt(i.balance_remaining)}</span>
                        )}
                        {i.paid_total !== null && i.paid_total > 0 && (
                          <span className="text-gray-400">Total pagado: ${fmt(i.paid_total)}</span>
                        )}
                      </div>
                      {/* Notas */}
                      {i.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{i.notes}</p>
                      )}
                    </div>
                    {/* Monto + comprobante */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-600 text-lg">+${fmt(i.amount)}</p>
                      <p className="text-xs text-gray-400">{i.currency}</p>
                      {i.proof_filename && (
                        <a href={`/api/uploads/proofs/${i.proof_filename}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700 underline block mt-1">
                          {isImage ? "📷 Ver comprobante" : "📎 Ver doc."}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EGRESOS ── */}
      {tab === "expenses" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">{expenses.length} egreso{expenses.length !== 1 ? "s" : ""} registrado{expenses.length !== 1 ? "s" : ""}</p>
            <button onClick={() => setShowExpenseForm(true)}
              className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600">
              + Registrar egreso
            </button>
          </div>
          <div className="space-y-2">
            {expenses.map(e => (
              <div key={e.id} className="bg-white border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{e.category}</span>
                    {e.supplier_name && <span className="text-xs text-gray-400">{e.supplier_name}</span>}
                    <span className="text-xs text-gray-400">{fmtDate(e.expense_date)}</span>
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5">{e.description}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-red-500">-${fmt(e.amount)} <span className="text-xs font-normal">{e.currency}</span></span>
                  <button onClick={() => deleteExp(e.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="bg-white border rounded-xl py-10 text-center text-gray-400 text-sm">
                <p className="text-3xl mb-2">📤</p>
                <p>Sin egresos registrados.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal egreso ── */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800">Registrar egreso</h2>
              <button onClick={() => setShowExpenseForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Proveedor</label>
                <select value={expForm.supplier_id} onChange={e => setExpForm({...expForm, supplier_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  <option value="">Sin proveedor</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Reserva asociada</label>
                <select value={expForm.reservation_id} onChange={e => setExpForm({...expForm, reservation_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  <option value="">Sin reserva</option>
                  {reservations.map(r => <option key={r.id} value={r.id}>{r.client_name} — {r.service_name} {r.reservation_code ? `(${r.reservation_code})` : ""}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Categoría</label>
                  <select value={expForm.category} onChange={e => setExpForm({...expForm, category: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Fecha</label>
                  <input type="date" value={expForm.expense_date} onChange={e => setExpForm({...expForm, expense_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Descripción *</label>
                <input value={expForm.description} onChange={e => setExpForm({...expForm, description: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Monto COP *</label>
                <input type="number" value={expForm.amount} onChange={e => setExpForm({...expForm, amount: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowExpenseForm(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={addExpense} disabled={!expForm.description || !expForm.amount}
                  className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                  Registrar egreso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ingreso manual ── */}
      {showIncomeForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800">Registrar ingreso manual</h2>
              <button onClick={() => setShowIncomeForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Cliente</label>
                  <input value={incForm.client_name} onChange={e => setIncForm({...incForm, client_name: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Servicio / Plan</label>
                  <input value={incForm.service_name} onChange={e => setIncForm({...incForm, service_name: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">N° Reserva</label>
                  <input value={incForm.reservation_code} onChange={e => setIncForm({...incForm, reservation_code: e.target.value})} placeholder="RES-..." className="w-full border rounded-lg px-3 py-2 mt-1 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Fecha</label>
                  <input type="date" value={incForm.income_date} onChange={e => setIncForm({...incForm, income_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Monto COP *</label>
                <input type="number" value={incForm.amount} onChange={e => setIncForm({...incForm, amount: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notas</label>
                <input value={incForm.notes} onChange={e => setIncForm({...incForm, notes: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowIncomeForm(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={addIncomeManual} disabled={!incForm.amount}
                  className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                  Registrar ingreso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
