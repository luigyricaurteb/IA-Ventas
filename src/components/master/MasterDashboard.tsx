"use client";
import { useState, useEffect } from "react";

interface Company { id: number; slug: string; name: string; email: string | null; phone: string | null; plan_name: string | null; status: string; sub_status: string | null; sub_ends_at: number | null }
interface Plan { id: number; name: string; description: string | null; price_monthly: number; billing_cycle: string; modules: string; max_users: number; max_wa_numbers: number; active: number }
interface Subscription { id: number; company_id: number; plan_id: number; billing_cycle: string; status: string; payment_amount: number | null; payment_proof_file: string | null; notes: string | null; created_at: number }

const MODULES = ["chat","crm","calendar","accounting","suppliers","products","campaigns","documents","analytics","settings"];
const MODULE_LABELS: Record<string,string> = {
  chat:"💬 Chat", crm:"👥 CRM", calendar:"📅 Calendario", accounting:"💰 Contabilidad",
  suppliers:"🤝 Proveedores", products:"🛍️ Productos", campaigns:"📧 Campañas",
  documents:"📄 Documentos", analytics:"📊 Analytics", settings:"⚙️ Ajustes",
};
const STATUS_COLORS: Record<string,string> = {
  active:"text-emerald-400 bg-emerald-900/50", suspended:"text-red-400 bg-red-900/50",
  trial:"text-blue-400 bg-blue-900/50", pending:"text-amber-400 bg-amber-900/50",
};
const BILLING_LABELS: Record<string,string> = { monthly:"Mensual", yearly:"Anual", permanent:"Pago único" };

function fmt(n: number) { return n.toLocaleString("es-CO"); }

function ModuleSwitch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 cursor-pointer" onClick={() => onChange(!checked)}>
      <div className={`relative w-8 h-4 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-gray-600"}`}>
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </div>
      <span className={`text-xs ${checked ? "text-emerald-400" : "text-gray-500"}`}>{MODULE_LABELS[id]}</span>
    </div>
  );
}

const EMPTY_PLAN = { name:"", description:"", price_monthly:120000, billing_cycle:"monthly", max_users:3, max_wa_numbers:1, modules: Object.fromEntries(MODULES.map(m=>[m,false])) };

export default function MasterDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab]           = useState<"companies"|"plans"|"subscriptions">("companies");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [subs, setSubs]         = useState<Subscription[]>([]);
  const [showNewCompany, setNewCompany] = useState(false);
  const [showNewPlan, setShowNewPlan]   = useState(false);
  const [editingPlan, setEditingPlan]   = useState<Plan | null>(null);
  const [companyForm, setCompanyForm]   = useState({ name:"", slug:"", email:"", phone:"", plan_id:"" });
  const [planForm, setPlanForm]         = useState(EMPTY_PLAN);
  const [saving, setSaving]             = useState(false);

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
    setNewCompany(false); setCompanyForm({name:"",slug:"",email:"",phone:"",plan_id:""}); fetchAll(); setSaving(false);
  }

  function openNewPlan() { setPlanForm(EMPTY_PLAN); setEditingPlan(null); setShowNewPlan(true); }
  function openEditPlan(p: Plan) {
    const mods = JSON.parse(p.modules||"{}");
    setPlanForm({
      name: p.name, description: p.description||"",
      price_monthly: p.price_monthly, billing_cycle: p.billing_cycle,
      max_users: p.max_users, max_wa_numbers: p.max_wa_numbers,
      modules: Object.fromEntries(MODULES.map(m=>[m, !!mods[m]])),
    });
    setEditingPlan(p);
    setShowNewPlan(true);
  }

  async function savePlan() {
    setSaving(true);
    const modules = JSON.stringify(planForm.modules);
    const body = { ...planForm, modules };
    if (editingPlan) {
      await fetch(`/api/master/plans/${editingPlan.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    } else {
      await fetch("/api/master/plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    }
    setShowNewPlan(false); setEditingPlan(null); fetchAll(); setSaving(false);
  }

  async function deletePlan(id: number) {
    if (!confirm("¿Desactivar este plan?")) return;
    await fetch(`/api/master/plans/${id}`,{method:"DELETE"});
    fetchAll();
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
    return Math.floor((ts - Date.now()/1000) / 86400);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
          <div>
            <p className="text-white font-semibold text-sm">Administración de Plataforma</p>
            <p className="text-gray-400 text-xs">{companies.length} empresas · {plans.filter(p=>p.active).length} planes</p>
          </div>
        </div>
        <button onClick={onLogout} className="text-gray-400 hover:text-red-400 text-sm">Salir</button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 px-6 border-b border-gray-700 shrink-0">
        {(["companies","plans","subscriptions"] as const).map(id => (
          <button key={id} onClick={()=>setTab(id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab===id?"border-emerald-500 text-emerald-400":"border-transparent text-gray-400 hover:text-gray-200"}`}>
            {id==="companies"?"🏢 Empresas":id==="plans"?"📋 Planes":"💳 Pagos"}
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
            <div className="space-y-3">
              {companies.map(c=>{
                const days = daysLeft(c.sub_ends_at);
                return (
                  <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{c.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status]||""}`}>{c.status}</span>
                        {days !== null && days <= 5 && days >= 0 && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">⚠️ Vence en {days}d</span>}
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">/{c.slug} · {c.plan_name||"Sin plan"} · {c.email||""}</p>
                    </div>
                    <button onClick={()=>toggleStatus(c.id, c.status)}
                      className={`text-xs px-3 py-1.5 rounded-lg shrink-0 ${c.status==="active"?"bg-red-900 text-red-300 hover:bg-red-800":"bg-emerald-900 text-emerald-300 hover:bg-emerald-800"}`}>
                      {c.status==="active"?"Suspender":"Activar"}
                    </button>
                  </div>
                );
              })}
              {companies.length===0 && <p className="text-gray-500 text-center py-8">Sin empresas registradas.</p>}
            </div>
          </div>
        )}

        {/* ── PLANES ── */}
        {tab==="plans" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-semibold">Planes de suscripción</h2>
              <button onClick={openNewPlan} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600">+ Nuevo plan</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {plans.map(p=>{
                const mods = JSON.parse(p.modules||"{}");
                const isActive = !!p.active;
                return (
                  <div key={p.id} className={`bg-gray-800 border rounded-xl p-5 ${isActive?"border-gray-700":"border-gray-700/40 opacity-60"}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-white font-semibold">{p.name}</h3>
                      <div className="flex gap-1">
                        <button onClick={()=>openEditPlan(p)} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded">✏️</button>
                        <button onClick={()=>deletePlan(p.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded">✕</button>
                      </div>
                    </div>
                    {p.description && <p className="text-gray-400 text-xs mb-2">{p.description}</p>}
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-emerald-400 font-bold text-lg">${fmt(p.price_monthly)}</span>
                      <span className="text-gray-400 text-xs">COP / {BILLING_LABELS[p.billing_cycle]||p.billing_cycle}</span>
                    </div>
                    <p className="text-gray-500 text-xs mb-3">Hasta {p.max_users === 999 ? "∞" : p.max_users} usuarios · {p.max_wa_numbers} número{p.max_wa_numbers!==1?"s":""} WA</p>
                    <div className="grid grid-cols-1 gap-1">
                      {MODULES.map(m=>(
                        <div key={m} className={`text-xs flex items-center gap-1.5 ${mods[m]?"text-emerald-400":"text-gray-600"}`}>
                          <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${mods[m]?"bg-emerald-500":"bg-gray-700"}`}>
                            {mods[m]?"✓":"✗"}
                          </span>
                          {MODULE_LABELS[m]}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {plans.length===0 && <p className="text-gray-500 col-span-3 text-center py-8">Sin planes configurados.</p>}
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
                        <span className={`text-xs px-2 py-0.5 rounded-full ${s.status==="active"?"bg-emerald-900 text-emerald-300":s.status==="pending"?"bg-amber-900 text-amber-300":"bg-gray-700 text-gray-400"}`}>
                          {s.status}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {plans.find(p=>p.id===s.plan_id)?.name||"Plan #"+s.plan_id} · {BILLING_LABELS[s.billing_cycle]||s.billing_cycle}
                        {s.payment_amount ? ` · $${fmt(s.payment_amount)} COP` : ""}
                      </p>
                      {s.payment_proof_file && (
                        <a href={`/uploads/payment-proofs/${s.payment_proof_file}`} target="_blank" rel="noopener" className="text-xs text-blue-400 underline mt-1 block">
                          Ver comprobante
                        </a>
                      )}
                    </div>
                    {s.status==="pending" && (
                      <button onClick={()=>approveSub(s.id)} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600 shrink-0">
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

      {/* ── Modal nueva empresa ── */}
      {showNewCompany && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-white font-bold mb-4">Nueva empresa</h3>
            <div className="space-y-3">
              {([["name","Nombre*"],["slug","Slug (URL)*"],["email","Email"],["phone","Teléfono"]] as [string,string][]).map(([k,l])=>(
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
                  {plans.map(p=><option key={p.id} value={p.id}>{p.name} — ${fmt(p.price_monthly)} COP</option>)}
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

      {/* ── Modal crear / editar plan ── */}
      {showNewPlan && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold mb-4">{editingPlan ? `Editar plan: ${editingPlan.name}` : "Nuevo plan"}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs">Nombre del plan *</label>
                <input value={planForm.name} onChange={e=>setPlanForm({...planForm,name:e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs">Descripción</label>
                <input value={planForm.description} onChange={e=>setPlanForm({...planForm,description:e.target.value})}
                  placeholder="Ej: Ideal para pequeñas empresas"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs">Precio (COP) *</label>
                  <input type="number" value={planForm.price_monthly}
                    onChange={e=>setPlanForm({...planForm,price_monthly:Number(e.target.value)})}
                    placeholder="120000"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                  {planForm.price_monthly > 0 && (
                    <p className="text-emerald-400 text-xs mt-0.5">${fmt(planForm.price_monthly)} COP</p>
                  )}
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Ciclo de cobro</label>
                  <select value={planForm.billing_cycle} onChange={e=>setPlanForm({...planForm,billing_cycle:e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1">
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="permanent">Pago único</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Máx. usuarios</label>
                  <input type="number" value={planForm.max_users}
                    onChange={e=>setPlanForm({...planForm,max_users:Number(e.target.value)})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Números WhatsApp</label>
                  <input type="number" value={planForm.max_wa_numbers}
                    onChange={e=>setPlanForm({...planForm,max_wa_numbers:Number(e.target.value)})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-2">Módulos incluidos en el plan</label>
                <div className="grid grid-cols-2 gap-2 bg-gray-700/50 rounded-xl p-3">
                  {MODULES.map(m=>(
                    <ModuleSwitch key={m} id={m} checked={!!planForm.modules[m]}
                      onChange={v=>setPlanForm({...planForm,modules:{...planForm.modules,[m]:v}})} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{setShowNewPlan(false);setEditingPlan(null);}} className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2 text-sm">Cancelar</button>
              <button onClick={savePlan} disabled={!planForm.name||saving}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm disabled:opacity-50">
                {saving?"Guardando...":(editingPlan?"Guardar cambios":"Crear plan")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
