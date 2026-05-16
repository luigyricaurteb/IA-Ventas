"use client";
import { useState, useEffect } from "react";

interface Company { id: number; slug: string; name: string; email: string | null; phone: string | null; plan_name: string | null; status: string; sub_status: string | null; sub_ends_at: number | null }
interface Plan { id: number; name: string; price_monthly: number; billing_cycle: string; modules: string; max_users: number; active: number }
interface Subscription { id: number; company_id: number; plan_id: number; billing_cycle: string; status: string; payment_amount: number | null; payment_proof_file: string | null; notes: string | null; created_at: number }

const MODULES = ["chat","crm","calendar","accounting","suppliers","products","campaigns","documents","analytics","settings"];
const MODULE_LABELS: Record<string, string> = { chat:"💬 Chat", crm:"👥 CRM", calendar:"📅 Calendario", accounting:"💰 Contabilidad", suppliers:"🤝 Proveedores", products:"🛍️ Productos", campaigns:"📧 Campañas", documents:"📄 Documentos", analytics:"📊 Analytics", settings:"⚙️ Ajustes" };
const STATUS_COLORS: Record<string, string> = { active:"text-emerald-600 bg-emerald-50", suspended:"text-red-600 bg-red-50", trial:"text-blue-600 bg-blue-50", pending:"text-amber-600 bg-amber-50" };

export default function MasterDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab]         = useState<"companies"|"plans"|"subscriptions">("companies");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [subs, setSubs]       = useState<Subscription[]>([]);
  const [showNewCompany, setNewCompany] = useState(false);
  const [showNewPlan, setNewPlan] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name:"", slug:"", email:"", phone:"", plan_id:"" });
  const [planForm, setPlanForm] = useState({ name:"", description:"", price_monthly:29, billing_cycle:"monthly", max_users:3, max_wa_numbers:1, modules: Object.fromEntries(MODULES.map(m=>[m,false])) });
  const [saving, setSaving]   = useState(false);

  async function fetchAll() {
    Promise.all([
      fetch("/api/master/companies").then(r=>r.json()).then(d=>setCompanies(d.companies||[])),
      fetch("/api/master/plans").then(r=>r.json()).then(d=>setPlans(d.plans||[])),
      fetch("/api/master/subscriptions").then(r=>r.json()).then(d=>setSubs(d.subscriptions||[])),
    ]).catch(()=>{});
  }
  useEffect(()=>{ fetchAll(); },[]);

  async function createCompany() {
    setSaving(true);
    await fetch("/api/master/companies",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(companyForm)});
    setNewCompany(false); fetchAll(); setSaving(false);
  }
  async function createPlan() {
    setSaving(true);
    const modules = JSON.stringify(planForm.modules);
    await fetch("/api/master/plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...planForm,modules})});
    setNewPlan(false); fetchAll(); setSaving(false);
  }
  async function toggleStatus(id: number, current: string) {
    const status = current==="active"?"suspended":"active";
    await fetch(`/api/master/companies/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
    fetchAll();
  }
  async function approveSub(id: number) {
    if (!confirm("¿Aprobar este pago y activar la empresa?")) return;
    await fetch(`/api/master/subscriptions/${id}`,{method:"POST"});
    fetchAll();
  }

  function daysLeft(ts: number | null) {
    if (!ts) return null;
    const d = Math.floor((ts - Date.now()/1000) / 86400);
    return d;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">M</div>
          <div>
            <p className="text-white font-semibold text-sm">Administración de Plataforma</p>
            <p className="text-gray-400 text-xs">{companies.length} empresas · {plans.filter(p=>p.active).length} planes activos</p>
          </div>
        </div>
        <button onClick={onLogout} className="text-gray-400 hover:text-red-400 text-sm">Salir</button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 px-6 border-b border-gray-700">
        {[["companies","🏢 Empresas"],["plans","📋 Planes"],["subscriptions","💳 Pagos"]] .map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id as typeof tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab===id?"border-emerald-500 text-emerald-400":"border-transparent text-gray-400 hover:text-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── EMPRESAS ── */}
        {tab==="companies" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-semibold">Empresas afiliadas</h2>
              <button onClick={()=>setNewCompany(true)} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600">+ Nueva empresa</button>
            </div>
            <div className="grid gap-3">
              {companies.map(c=>{
                const days = daysLeft(c.sub_ends_at);
                return (
                  <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{c.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status]||""}`}>{c.status}</span>
                        {days !== null && days <= 5 && days >= 0 && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">⚠️ Vence en {days}d</span>}
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">/{c.slug} · {c.plan_name||"Sin plan"} · {c.email||""}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>toggleStatus(c.id, c.status)} className={`text-xs px-3 py-1.5 rounded-lg ${c.status==="active"?"bg-red-900 text-red-300 hover:bg-red-800":"bg-emerald-900 text-emerald-300 hover:bg-emerald-800"}`}>
                        {c.status==="active"?"Suspender":"Activar"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {companies.length===0 && <p className="text-gray-500 text-center py-8">Sin empresas. Crea la primera.</p>}
            </div>
          </div>
        )}

        {/* ── PLANES ── */}
        {tab==="plans" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-semibold">Planes de suscripción</h2>
              <button onClick={()=>setNewPlan(true)} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600">+ Nuevo plan</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plans.map(p=>{
                const modules = JSON.parse(p.modules||"{}");
                return (
                  <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-white font-semibold">{p.name}</h3>
                      <span className="text-emerald-400 font-bold">${p.price_monthly}<span className="text-gray-400 font-normal text-xs">/mes</span></span>
                    </div>
                    <p className="text-gray-400 text-xs mb-3">Hasta {p.max_users} usuarios</p>
                    <div className="grid grid-cols-2 gap-1">
                      {MODULES.map(m=>(
                        <div key={m} className={`text-xs flex items-center gap-1 ${modules[m]?"text-emerald-400":"text-gray-600"}`}>
                          <span>{modules[m]?"✓":"✗"}</span>
                          <span>{MODULE_LABELS[m]?.split(" ")[1]||m}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PAGOS ── */}
        {tab==="subscriptions" && (
          <div>
            <h2 className="text-white font-semibold mb-4">Comprobantes de pago</h2>
            <div className="space-y-3">
              {subs.map(s=>{
                const company = companies.find(c=>c.id===s.company_id);
                return (
                  <div key={s.id} className={`bg-gray-800 border rounded-xl p-4 flex items-center justify-between ${s.status==="pending"?"border-amber-500/50":"border-gray-700"}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{company?.name||"Empresa #"+s.company_id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${s.status==="active"?"bg-emerald-900 text-emerald-300":s.status==="pending"?"bg-amber-900 text-amber-300":"bg-gray-700 text-gray-400"}`}>{s.status}</span>
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {plans.find(p=>p.id===s.plan_id)?.name||"Plan #"+s.plan_id} · {s.billing_cycle}
                        {s.payment_amount && ` · $${s.payment_amount.toLocaleString("es-CO")} COP`}
                      </p>
                      {s.payment_proof_file && (
                        <a href={`/uploads/payment-proofs/${s.payment_proof_file}`} target="_blank" rel="noopener" className="text-xs text-blue-400 underline mt-1 block">
                          Ver comprobante
                        </a>
                      )}
                    </div>
                    {s.status==="pending" && (
                      <button onClick={()=>approveSub(s.id)} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600">
                        ✓ Aprobar
                      </button>
                    )}
                  </div>
                );
              })}
              {subs.length===0 && <p className="text-gray-500 text-center py-8">Sin pagos registrados.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva empresa */}
      {showNewCompany && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-white font-bold mb-4">Nueva empresa</h3>
            <div className="space-y-3">
              {[["name","Nombre*"],["slug","Slug (URL)*"],["email","Email"],["phone","Teléfono"]].map(([k,l])=>(
                <div key={k}>
                  <label className="text-gray-400 text-xs">{l}</label>
                  <input value={(companyForm as Record<string,string>)[k]} onChange={e=>setCompanyForm({...companyForm,[k]:e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                </div>
              ))}
              <div>
                <label className="text-gray-400 text-xs">Plan</label>
                <select value={companyForm.plan_id} onChange={e=>setCompanyForm({...companyForm,plan_id:e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1">
                  <option value="">Sin plan</option>
                  {plans.map(p=><option key={p.id} value={p.id}>{p.name} — ${p.price_monthly}/mes</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>setNewCompany(false)} className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={createCompany} disabled={!companyForm.name||!companyForm.slug||saving}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm disabled:opacity-50">
                {saving?"Creando...":"Crear empresa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo plan */}
      {showNewPlan && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold mb-4">Nuevo plan</h3>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs">Nombre*</label>
                <input value={planForm.name} onChange={e=>setPlanForm({...planForm,name:e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs">Precio/mes USD</label>
                  <input type="number" value={planForm.price_monthly} onChange={e=>setPlanForm({...planForm,price_monthly:Number(e.target.value)})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Ciclo</label>
                  <select value={planForm.billing_cycle} onChange={e=>setPlanForm({...planForm,billing_cycle:e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1">
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="permanent">Permanente</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Máx. usuarios</label>
                  <input type="number" value={planForm.max_users} onChange={e=>setPlanForm({...planForm,max_users:Number(e.target.value)})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Máx. números WA</label>
                  <input type="number" value={planForm.max_wa_numbers} onChange={e=>setPlanForm({...planForm,max_wa_numbers:Number(e.target.value)})} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-2">Módulos incluidos</label>
                <div className="grid grid-cols-2 gap-2">
                  {MODULES.map(m=>(
                    <label key={m} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={planForm.modules[m]||false} onChange={e=>setPlanForm({...planForm,modules:{...planForm.modules,[m]:e.target.checked}})} />
                      <span className="text-gray-300 text-sm">{MODULE_LABELS[m]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>setNewPlan(false)} className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={createPlan} disabled={!planForm.name||saving} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm disabled:opacity-50">
                {saving?"Creando...":"Crear plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
