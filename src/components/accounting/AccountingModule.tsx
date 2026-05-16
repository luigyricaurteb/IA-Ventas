"use client";
import { useState, useEffect } from "react";

type Tab = "overview" | "income" | "expenses";
interface Income { id: number; client_name: string | null; service_name: string | null; amount: number; currency: string; income_date: number; notes: string | null }
interface Expense { id: number; supplier_name: string | null; category: string; description: string; amount: number; currency: string; expense_date: number }
interface Supplier { id: number; name: string }
interface Reservation { id: number; client_name: string | null; service_name: string | null }
interface Summary { total_income: number; total_expense: number; margin: number }

const CATEGORIES = ["general","transporte","alojamiento","alimentación","guía","entrada","logística","marketing","otro"];

function fmt(n: number) { return n.toLocaleString("es-CO", { minimumFractionDigits: 0 }); }
function fmtDate(ts: number) { return new Date(ts * 1000).toLocaleDateString("es-CO"); }

export default function AccountingModule() {
  const [tab, setTab] = useState<Tab>("overview");
  const [income, setIncome] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_income: 0, total_expense: 0, margin: 0 });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expForm, setExpForm] = useState({ supplier_id: "", reservation_id: "", category: "general", description: "", amount: "", expense_date: new Date().toISOString().slice(0, 10) });

  async function fetchAll() {
    const [i, e, s, r, sum] = await Promise.all([
      fetch("/api/accounting/income").then(r => r.json()),
      fetch("/api/accounting/expenses").then(r => r.json()),
      fetch("/api/suppliers").then(r => r.json()),
      fetch("/api/calendar?view=list&page=0").then(r => r.json()),
      fetch("/api/accounting/summary").then(r => r.json()),
    ]);
    setIncome(i.income ?? []);
    setExpenses(e.expenses ?? []);
    setSuppliers(s.suppliers ?? []);
    setReservations(r.rows ?? []);
    setSummary(sum.summary ?? { total_income: 0, total_expense: 0, margin: 0 });
  }
  useEffect(() => { fetchAll(); }, []);

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
    setExpForm({ supplier_id: "", reservation_id: "", category: "general", description: "", amount: "", expense_date: new Date().toISOString().slice(0, 10) });
    fetchAll();
  }

  async function deleteExp(id: number) {
    await fetch(`/api/accounting/expenses/${id}`, { method: "DELETE" });
    fetchAll();
  }

  const marginPct = summary.total_income > 0
    ? Math.round((summary.margin / summary.total_income) * 100)
    : 0;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Contabilidad</h1>
        <button onClick={() => setShowExpenseForm(true)} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600">+ Registrar egreso</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Ingresos</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">${fmt(summary.total_income)}</p>
          <p className="text-xs text-emerald-500">COP</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Egresos</p>
          <p className="text-2xl font-bold text-red-700 mt-1">${fmt(summary.total_expense)}</p>
          <p className="text-xs text-red-500">COP</p>
        </div>
        <div className={`border rounded-xl p-4 ${summary.margin >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${summary.margin >= 0 ? "text-blue-600" : "text-orange-600"}`}>Margen bruto</p>
          <p className={`text-2xl font-bold mt-1 ${summary.margin >= 0 ? "text-blue-700" : "text-orange-700"}`}>${fmt(summary.margin)}</p>
          <p className={`text-xs ${summary.margin >= 0 ? "text-blue-500" : "text-orange-500"}`}>{marginPct}% del ingreso</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {(["overview","income","expenses"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "overview" ? "Resumen" : t === "income" ? "Ingresos" : "Egresos"}
          </button>
        ))}
      </div>

      {/* Ingresos */}
      {(tab === "overview" || tab === "income") && (
        <div className="mb-6">
          {tab === "income" && <h2 className="font-semibold text-gray-700 mb-3">Ingresos registrados</h2>}
          {tab === "overview" && <h2 className="font-semibold text-gray-700 mb-3">Últimos ingresos</h2>}
          <div className="space-y-2">
            {income.slice(0, tab === "overview" ? 5 : 200).map((i) => (
              <div key={i.id} className="bg-white border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-800">{i.client_name ?? "—"}</p>
                  <p className="text-xs text-gray-400">{i.service_name} · {fmtDate(i.income_date)}</p>
                  {i.notes && <p className="text-xs text-gray-300">{i.notes}</p>}
                </div>
                <span className="font-bold text-emerald-600">${fmt(i.amount)} {i.currency}</span>
              </div>
            ))}
            {income.length === 0 && <p className="text-gray-400 text-sm text-center py-6">Los ingresos se generan automáticamente al aprobar reservas.</p>}
          </div>
        </div>
      )}

      {/* Egresos */}
      {(tab === "overview" || tab === "expenses") && (
        <div>
          {tab === "expenses" && <h2 className="font-semibold text-gray-700 mb-3">Egresos registrados</h2>}
          {tab === "overview" && <h2 className="font-semibold text-gray-700 mb-3">Últimos egresos</h2>}
          <div className="space-y-2">
            {expenses.slice(0, tab === "overview" ? 5 : 200).map((e) => (
              <div key={e.id} className="bg-white border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{e.category}</span>
                    {e.supplier_name && <span className="text-xs text-gray-400">{e.supplier_name}</span>}
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5">{e.description}</p>
                  <p className="text-xs text-gray-400">{fmtDate(e.expense_date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-red-500">-${fmt(e.amount)} {e.currency}</span>
                  <button onClick={() => deleteExp(e.id)} className="text-gray-300 hover:text-red-400 text-xs">×</button>
                </div>
              </div>
            ))}
            {expenses.length === 0 && <p className="text-gray-400 text-sm text-center py-6">Sin egresos registrados.</p>}
          </div>
        </div>
      )}

      {/* Form egreso */}
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
                <select value={expForm.supplier_id} onChange={(e) => setExpForm({...expForm, supplier_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Reserva asociada</label>
                <select value={expForm.reservation_id} onChange={(e) => setExpForm({...expForm, reservation_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  <option value="">Sin reserva</option>
                  {reservations.map((r) => <option key={r.id} value={r.id}>{r.client_name} — {r.service_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Categoría</label>
                  <select value={expForm.category} onChange={(e) => setExpForm({...expForm, category: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Fecha</label>
                  <input type="date" value={expForm.expense_date} onChange={(e) => setExpForm({...expForm, expense_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Descripción *</label>
                <input value={expForm.description} onChange={(e) => setExpForm({...expForm, description: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Monto COP *</label>
                <input type="number" value={expForm.amount} onChange={(e) => setExpForm({...expForm, amount: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowExpenseForm(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={addExpense} disabled={!expForm.description || !expForm.amount} className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 hover:bg-red-600">
                  Registrar egreso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
