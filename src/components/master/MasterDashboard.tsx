"use client";
import { useState, useEffect, useCallback } from "react";

interface Company { id: number; slug: string; name: string; nit: string | null; email: string | null; phone: string | null; address: string | null; logo_filename: string | null; plan_name: string | null; plan_id: number | null; status: string; sub_status: string | null; sub_ends_at: number | null }
interface Plan { id: number; name: string; description: string | null; price_monthly: number; billing_cycle: string; modules: string; max_users: number; max_wa_numbers: number; active: number }
interface Subscription { id: number; company_id: number; plan_id: number; billing_cycle: string; status: string; payment_amount: number | null; payment_proof_file: string | null; notes: string | null; created_at: number }
interface CompanyUser { id: number; username: string; name: string; permissions: string; is_admin: number; active: number }

// settings y subscription NO son módulos de plan — siempre están disponibles para admins
const MODULES = ["chat","crm","calendar","accounting","suppliers","products","campaigns","documents","analytics"];
const ML: Record<string,string> = { chat:"💬 Chat", crm:"👥 CRM", calendar:"📅 Calendario", accounting:"💰 Contabilidad", suppliers:"🤝 Proveedores", products:"🛍️ Productos", campaigns:"📧 Campañas", documents:"📄 Documentos", analytics:"📊 Analytics" };
const SC: Record<string,string> = { active:"text-emerald-400 bg-emerald-900/50", suspended:"text-red-400 bg-red-900/50", trial:"text-blue-400 bg-blue-900/50", pending:"text-amber-400 bg-amber-900/50" };
const BL: Record<string,string> = { monthly:"Mensual", yearly:"Anual", permanent:"Pago único" };

function fmt(n: number) { return n.toLocaleString("es-CO"); }

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-2 cursor-pointer" onClick={() => onChange(!checked)}>
      <div className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-emerald-500" : "bg-gray-600"}`}>
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </div>
      {label && <span className={`text-xs ${checked ? "text-emerald-400" : "text-gray-500"}`}>{label}</span>}
    </div>
  );
}

const EMPTY_PLAN = { name:"", description:"", price_monthly:120000, billing_cycle:"monthly", max_users:3, max_wa_numbers:1, modules: Object.fromEntries(MODULES.map(m=>[m,false])) };

export default function MasterDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<"companies"|"plans"|"subscriptions">("companies");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans]         = useState<Plan[]>([]);
  const [subs, setSubs]           = useState<Subscription[]>([]);
  const [saving, setSaving]       = useState(false);

  // Empresa
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name:"", slug:"", nit:"", email:"", phone:"", address:"", plan_id:"", status:"active" });
  const [adminForm, setAdminForm] = useState({ username:"", name:"", password:"" });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Plan
  const [editingPlan, setEditingPlan]   = useState<Plan | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm]         = useState(EMPTY_PLAN);

  // Usuarios por empresa
  const [usersCompanyId, setUsersCompanyId]   = useState<number | null>(null);
  const [usersSlug, setUsersSlug]             = useState<string>("");
  const [companyUsers, setCompanyUsers]       = useState<CompanyUser[]>([]);
  const [editingUser, setEditingUser]         = useState<number | null>(null);
  const [showNewUser, setShowNewUser]         = useState(false);
  const [newUserForm, setNewUserForm]         = useState({ username:"", name:"", password:"", is_admin:false, permissions: Object.fromEntries(MODULES.map(m=>[m,false])) });

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/master/companies").then(r=>r.json()).then(d=>setCompanies(d.companies||[])),
      fetch("/api/master/plans").then(r=>r.json()).then(d=>setPlans(d.plans||[])),
      fetch("/api/master/subscriptions").then(r=>r.json()).then(d=>setSubs(d.subscriptions||[])),
    ]).catch(()=>{});
  }, []);
  useEffect(()=>{ fetchAll(); },[fetchAll]);

  // ── Empresa ──────────────────────────────────────────────────────────────
  function openNewCompany() {
    setCompanyForm({ name:"", slug:"", nit:"", email:"", phone:"", address:"", plan_id:"", status:"active" });
    setAdminForm({ username:"admin", name:"Administrador", password:"" });
    setLogoFile(null); setLogoPreview(null);
    setEditingCompany(null); setShowNewCompany(true);
  }
  function openEditCompany(c: Company) {
    setCompanyForm({ name:c.name, slug:c.slug, nit:c.nit||"", email:c.email||"", phone:c.phone||"", address:c.address||"", plan_id:c.plan_id?.toString()||"", status:c.status });
    setAdminForm({ username:"", name:"", password:"" });
    setLogoFile(null); setLogoPreview(c.logo_filename ? `/uploads/master/${c.logo_filename}` : null);
    setEditingCompany(c); setShowNewCompany(true);
  }
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    if (file) setLogoPreview(URL.createObjectURL(file));
  }
  async function saveCompany() {
    setSaving(true);
    try {
      if (editingCompany) {
        await fetch(`/api/master/companies/${editingCompany.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ name:companyForm.name, nit:companyForm.nit||null, email:companyForm.email||null, phone:companyForm.phone||null, address:companyForm.address||null, plan_id:companyForm.plan_id?Number(companyForm.plan_id):null, status:companyForm.status })});
        if (logoFile) {
          const fd = new FormData(); fd.append("logo", logoFile);
          await fetch(`/api/master/companies/${editingCompany.id}`,{method:"POST",body:fd});
        }
      } else {
        const slug = companyForm.slug.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,50);
        const res = await fetch("/api/master/companies",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({...companyForm, slug, admin_username:adminForm.username, admin_name:adminForm.name, admin_password:adminForm.password})});
        const d = await res.json() as { company?: { id: number }; error?: string };
        if (!res.ok) { alert(d.error ?? "Error al crear empresa"); setSaving(false); return; }
        if (logoFile && d.company?.id) {
          const fd = new FormData(); fd.append("logo", logoFile);
          await fetch(`/api/master/companies/${d.company.id}`,{method:"POST",body:fd});
        }
      }
      setShowNewCompany(false); setEditingCompany(null); fetchAll();
    } finally { setSaving(false); }
  }
  async function deleteCompany(c: Company) {
    if (!confirm(`¿Eliminar "${c.name}" permanentemente? Se borrarán todos sus datos, conversaciones y usuarios. Esta acción es irreversible.`)) return;
    await fetch(`/api/master/companies/${c.id}`,{method:"DELETE"});
    fetchAll();
  }
  async function toggleStatus(id: number, current: string) {
    await fetch(`/api/master/companies/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:current==="active"?"suspended":"active"})});
    fetchAll();
  }

  // ── Plan ─────────────────────────────────────────────────────────────────
  function openNewPlan() { setPlanForm(EMPTY_PLAN); setEditingPlan(null); setShowPlanForm(true); }
  function openEditPlan(p: Plan) {
    const mods = JSON.parse(p.modules||"{}");
    setPlanForm({ name:p.name, description:p.description||"", price_monthly:p.price_monthly, billing_cycle:p.billing_cycle, max_users:p.max_users, max_wa_numbers:p.max_wa_numbers, modules:Object.fromEntries(MODULES.map(m=>[m,!!mods[m]])) });
    setEditingPlan(p); setShowPlanForm(true);
  }
  async function savePlan() {
    setSaving(true);
    const body = { ...planForm, modules: JSON.stringify(planForm.modules) };
    if (editingPlan) await fetch(`/api/master/plans/${editingPlan.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    else await fetch("/api/master/plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    setShowPlanForm(false); setEditingPlan(null); fetchAll(); setSaving(false);
  }
  async function deletePlan(id: number) {
    if (!confirm("¿Desactivar este plan?")) return;
    await fetch(`/api/master/plans/${id}`,{method:"DELETE"}); fetchAll();
  }

  // ── Usuarios ─────────────────────────────────────────────────────────────
  async function openUsers(c: Company) {
    setUsersCompanyId(c.id); setUsersSlug(c.slug);
    const res = await fetch(`/api/master/companies/${c.id}/users`);
    const d = await res.json() as { users: CompanyUser[] };
    setCompanyUsers(d.users||[]);
    setEditingUser(null); setShowNewUser(false);
  }
  async function reloadUsers(id: number) {
    const res = await fetch(`/api/master/companies/${id}/users`);
    const d = await res.json() as { users: CompanyUser[] };
    setCompanyUsers(d.users||[]);
  }
  function parsePerms(raw: string): Record<string,boolean> {
    try { return JSON.parse(raw||"{}"); } catch { return {}; }
  }
  function setUserPerm(userId: number, mod: string, val: boolean) {
    setCompanyUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const p = parsePerms(u.permissions);
      return { ...u, permissions: JSON.stringify({...p,[mod]:val}) };
    }));
  }
  async function saveUserPerms(u: CompanyUser) {
    await fetch(`/api/master/companies/${usersCompanyId}/users/${u.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({permissions:parsePerms(u.permissions)})});
    setEditingUser(null);
  }
  async function toggleUserActive(u: CompanyUser) {
    await fetch(`/api/master/companies/${usersCompanyId}/users/${u.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!u.active})});
    reloadUsers(usersCompanyId!);
  }
  async function deleteUser(u: CompanyUser) {
    if (!confirm(`¿Eliminar usuario "${u.name}"?`)) return;
    await fetch(`/api/master/companies/${usersCompanyId}/users/${u.id}`,{method:"DELETE"});
    reloadUsers(usersCompanyId!);
  }
  async function createUser() {
    if (!newUserForm.username||!newUserForm.name||!newUserForm.password) return;
    setSaving(true);
    await fetch(`/api/master/companies/${usersCompanyId}/users`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...newUserForm,permissions:newUserForm.permissions})});
    setShowNewUser(false); setNewUserForm({username:"",name:"",password:"",is_admin:false,permissions:Object.fromEntries(MODULES.map(m=>[m,false]))});
    reloadUsers(usersCompanyId!); setSaving(false);
  }

  async function approveSub(id: number) {
    if (!confirm("¿Aprobar este pago y activar la empresa?")) return;
    await fetch(`/api/master/subscriptions/${id}`,{method:"POST"}); fetchAll();
  }
  function daysLeft(ts: number|null) { return ts ? Math.floor((ts-Date.now()/1000)/86400) : null; }

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
          <div>
            <p className="text-white font-semibold text-sm">Administración de Plataforma</p>
            <p className="text-gray-400 text-xs">{companies.length} empresas · {plans.filter(p=>p.active).length} planes activos</p>
          </div>
        </div>
        <button onClick={onLogout} className="text-gray-400 hover:text-red-400 text-sm">Salir</button>
      </header>

      <div className="flex gap-1 bg-gray-800 px-6 border-b border-gray-700 shrink-0">
        {(["companies","plans","subscriptions"] as const).map(id=>(
          <button key={id} onClick={()=>{ setTab(id); setUsersCompanyId(null); }}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab===id?"border-emerald-500 text-emerald-400":"border-transparent text-gray-400 hover:text-gray-200"}`}>
            {id==="companies"?"🏢 Empresas":id==="plans"?"📋 Planes":"💳 Pagos"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── EMPRESAS ── */}
        {tab==="companies" && !usersCompanyId && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-semibold">Empresas afiliadas</h2>
              <button onClick={openNewCompany} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600">+ Nueva empresa</button>
            </div>
            <div className="space-y-3">
              {companies.map(c=>{
                const days = daysLeft(c.sub_ends_at);
                return (
                  <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium">{c.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SC[c.status]||""}`}>{c.status}</span>
                          {days !== null && days <= 5 && days >= 0 && <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">⚠️ Vence en {days}d</span>}
                        </div>
                        <p className="text-gray-400 text-xs mt-0.5">/{c.slug} · {c.plan_name||"Sin plan"}</p>
                        <p className="text-gray-500 text-xs">{[c.nit,c.email,c.phone,c.address].filter(Boolean).join(" · ") || ""}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                        <button onClick={()=>openUsers(c)} className="text-xs bg-indigo-900 text-indigo-300 hover:bg-indigo-800 px-3 py-1.5 rounded-lg">👥 Usuarios</button>
                        <button onClick={()=>openEditCompany(c)} className="text-xs bg-blue-900 text-blue-300 hover:bg-blue-800 px-3 py-1.5 rounded-lg">✏️ Editar</button>
                        <button onClick={()=>toggleStatus(c.id,c.status)} className={`text-xs px-3 py-1.5 rounded-lg ${c.status==="active"?"bg-amber-900 text-amber-300 hover:bg-amber-800":"bg-emerald-900 text-emerald-300 hover:bg-emerald-800"}`}>
                          {c.status==="active"?"⏸ Suspender":"▶ Activar"}
                        </button>
                        <button onClick={()=>deleteCompany(c)} className="text-xs bg-red-900 text-red-300 hover:bg-red-800 px-3 py-1.5 rounded-lg">🗑 Eliminar</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {companies.length===0 && <p className="text-gray-500 text-center py-8">Sin empresas registradas.</p>}
            </div>
          </div>
        )}

        {/* ── USUARIOS DE EMPRESA ── */}
        {tab==="companies" && usersCompanyId && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <button onClick={()=>setUsersCompanyId(null)} className="text-gray-400 hover:text-gray-200 text-sm">← Empresas</button>
              <h2 className="text-white font-semibold">
                Usuarios de {companies.find(c=>c.id===usersCompanyId)?.name}
                <span className="text-gray-500 text-sm font-normal ml-2">/{usersSlug}</span>
              </h2>
              <button onClick={()=>setShowNewUser(true)} className="ml-auto bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600">+ Nuevo usuario</button>
            </div>

            {/* Formulario nuevo usuario */}
            {showNewUser && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
                <p className="text-white font-medium mb-3">Crear nuevo usuario</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-gray-400 text-xs">Usuario (login) *</label>
                    <input value={newUserForm.username} onChange={e=>setNewUserForm({...newUserForm,username:e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs">Nombre completo *</label>
                    <input value={newUserForm.name} onChange={e=>setNewUserForm({...newUserForm,name:e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-gray-400 text-xs">Contraseña temporal *</label>
                    <input type="password" value={newUserForm.password} onChange={e=>setNewUserForm({...newUserForm,password:e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <p className="text-gray-400 text-xs mb-2">Módulos visibles para este usuario</p>
                <div className="grid grid-cols-2 gap-1.5 bg-gray-700/50 rounded-xl p-3 mb-3">
                  {MODULES.map(m=>(
                    <Switch key={m} checked={!!newUserForm.permissions[m]} label={ML[m]}
                      onChange={v=>setNewUserForm(prev=>({...prev,permissions:{...prev.permissions,[m]:v}}))} />
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" id="newIsAdmin" checked={newUserForm.is_admin} onChange={e=>setNewUserForm({...newUserForm,is_admin:e.target.checked})} />
                  <label htmlFor="newIsAdmin" className="text-gray-300 text-sm">Administrador (acceso completo)</label>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>setShowNewUser(false)} className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2 text-sm">Cancelar</button>
                  <button onClick={createUser} disabled={!newUserForm.username||!newUserForm.name||!newUserForm.password||saving}
                    className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm disabled:opacity-50">
                    {saving?"Creando...":"Crear usuario"}
                  </button>
                </div>
              </div>
            )}

            {/* Lista de usuarios */}
            <div className="space-y-3">
              {companyUsers.map(u=>{
                const perms = parsePerms(u.permissions);
                const isEditing = editingUser === u.id;
                return (
                  <div key={u.id} className={`bg-gray-800 border border-gray-700 rounded-xl p-4 ${!u.active?"opacity-60":""}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {u.name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-medium text-sm">{u.name}</p>
                            {u.is_admin===1 && <span className="text-xs bg-indigo-900 text-indigo-300 px-1.5 py-0.5 rounded">Admin</span>}
                            <span className={`text-xs px-1.5 py-0.5 rounded ${u.active?"bg-emerald-900 text-emerald-300":"bg-gray-700 text-gray-400"}`}>
                              {u.active?"Activo":"Inactivo"}
                            </span>
                          </div>
                          <p className="text-gray-400 text-xs">@{u.username}</p>
                          {!isEditing && u.is_admin===0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {MODULES.filter(m=>perms[m]).map(m=>(
                                <span key={m} className="text-xs bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">{ML[m]}</span>
                              ))}
                              {MODULES.filter(m=>perms[m]).length===0 && <span className="text-xs text-gray-500">Sin módulos activos</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                        {u.is_admin===0 && (
                          <button onClick={()=>setEditingUser(isEditing?null:u.id)}
                            className={`text-xs px-3 py-1.5 rounded-lg ${isEditing?"bg-gray-700 text-gray-300":"bg-blue-900 text-blue-300 hover:bg-blue-800"}`}>
                            {isEditing?"Cerrar":"✏️ Permisos"}
                          </button>
                        )}
                        <button onClick={()=>toggleUserActive(u)}
                          className="text-xs bg-amber-900 text-amber-300 hover:bg-amber-800 px-3 py-1.5 rounded-lg">
                          {u.active?"⏸":"▶"}
                        </button>
                        <button onClick={()=>deleteUser(u)} className="text-xs bg-red-900 text-red-300 hover:bg-red-800 px-3 py-1.5 rounded-lg">🗑</button>
                      </div>
                    </div>

                    {isEditing && u.is_admin===0 && (
                      <div className="mt-3 border-t border-gray-700 pt-3">
                        <p className="text-gray-400 text-xs mb-2">Módulos visibles para @{u.username}</p>
                        <div className="grid grid-cols-2 gap-1.5 bg-gray-700/50 rounded-xl p-3 mb-3">
                          {MODULES.map(m=>(
                            <Switch key={m} checked={perms[m]===true} label={ML[m]}
                              onChange={v=>setUserPerm(u.id, m, v)} />
                          ))}
                        </div>
                        <button onClick={()=>saveUserPerms(u)}
                          className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-emerald-600">
                          Guardar permisos
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {companyUsers.length===0 && <p className="text-gray-500 text-center py-8">Sin usuarios en esta empresa.</p>}
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
                return (
                  <div key={p.id} className={`bg-gray-800 border border-gray-700 rounded-xl p-5 ${!p.active?"opacity-50":""}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-white font-semibold">{p.name}</h3>
                      <div className="flex gap-1">
                        <button onClick={()=>openEditPlan(p)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded">✏️</button>
                        <button onClick={()=>deletePlan(p.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded">✕</button>
                      </div>
                    </div>
                    {p.description && <p className="text-gray-400 text-xs mb-2">{p.description}</p>}
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-emerald-400 font-bold text-lg">${fmt(p.price_monthly)}</span>
                      <span className="text-gray-400 text-xs">COP / {BL[p.billing_cycle]||p.billing_cycle}</span>
                    </div>
                    <p className="text-gray-500 text-xs mb-3">Hasta {p.max_users===999?"∞":p.max_users} usuarios · {p.max_wa_numbers} WA</p>
                    <div className="grid grid-cols-1 gap-1">
                      {MODULES.map(m=>(
                        <div key={m} className={`text-xs flex items-center gap-1.5 ${mods[m]?"text-emerald-400":"text-gray-600"}`}>
                          <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] flex-shrink-0 ${mods[m]?"bg-emerald-500":"bg-gray-700"}`}>{mods[m]?"✓":"✗"}</span>
                          {ML[m]}
                        </div>
                      ))}
                      <div className="text-xs flex items-center gap-1.5 text-gray-500 mt-1 border-t border-gray-700 pt-1">
                        <span className="w-3 h-3 rounded-full flex items-center justify-center text-[9px] flex-shrink-0 bg-gray-700">✓</span>
                        ⚙️ Ajustes (siempre incluido)
                      </div>
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
                        <span className={`text-xs px-2 py-0.5 rounded-full ${s.status==="active"?"bg-emerald-900 text-emerald-300":s.status==="pending"?"bg-amber-900 text-amber-300":"bg-gray-700 text-gray-400"}`}>{s.status}</span>
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {plans.find(p=>p.id===s.plan_id)?.name||"Plan #"+s.plan_id} · {BL[s.billing_cycle]||s.billing_cycle}
                        {s.payment_amount?` · $${fmt(s.payment_amount)} COP`:""}
                      </p>
                      {s.payment_proof_file && <a href={`/uploads/payment-proofs/${s.payment_proof_file}`} target="_blank" rel="noopener" className="text-xs text-blue-400 underline mt-1 block">Ver comprobante</a>}
                    </div>
                    {s.status==="pending" && <button onClick={()=>approveSub(s.id)} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600 shrink-0">✓ Aprobar</button>}
                  </div>
                );
              })}
              {subs.length===0 && <p className="text-gray-500 text-center py-8">Sin pagos registrados.</p>}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal empresa (crear / editar) ── */}
      {showNewCompany && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-xl border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold mb-4 text-lg">{editingCompany ? "✏️ Editar empresa" : "🏢 Registrar nueva empresa"}</h3>

            {/* Logo */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-gray-700 border border-gray-600 flex items-center justify-center overflow-hidden">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                  : <span className="text-gray-500 text-2xl">🏢</span>}
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">Logo de la empresa</label>
                <label className="cursor-pointer bg-gray-700 border border-gray-600 text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-600">
                  Subir imagen
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </label>
                <p className="text-gray-500 text-xs mt-1">JPG, PNG o WEBP</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Datos de la empresa</p>
              <div className="grid grid-cols-2 gap-3">
                {([["name","Nombre de la empresa *"],["nit","NIT / RUT"],["email","Correo electrónico"],["phone","Teléfono"],["address","Dirección"],["slug","Slug / URL *"]] as [string,string][]).map(([k,l])=>(
                  <div key={k} className={k==="address"||k==="name"?"col-span-2":""}>
                    <label className="text-gray-400 text-xs">{l}</label>
                    <input value={(companyForm as Record<string,string>)[k]}
                      onChange={e => {
                        const val = e.target.value;
                        const update: Record<string,string> = { [k]: val };
                        // Auto-generar slug desde nombre
                        if (k === "name" && !editingCompany && !companyForm.slug) {
                          update.slug = val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30);
                        }
                        setCompanyForm(prev => ({ ...prev, ...update }));
                      }}
                      disabled={k==="slug"&&!!editingCompany}
                      placeholder={k==="slug" ? "mi-empresa" : k==="nit" ? "900123456-1" : ""}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500 disabled:opacity-50" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs">Plan asignado</label>
                  <select value={companyForm.plan_id} onChange={e=>setCompanyForm({...companyForm,plan_id:e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1">
                    <option value="">Sin plan</option>
                    {plans.map(p=><option key={p.id} value={p.id}>{p.name} — ${fmt(p.price_monthly)} COP</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Estado inicial</label>
                  <select value={companyForm.status} onChange={e=>setCompanyForm({...companyForm,status:e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1">
                    <option value="active">✅ Activa</option>
                    <option value="trial">🔵 Trial</option>
                    <option value="pending">🟡 Pendiente</option>
                    <option value="suspended">🔴 Suspendida</option>
                  </select>
                </div>
              </div>

              {/* Admin user — solo en creación */}
              {!editingCompany && (
                <>
                  <div className="border-t border-gray-700 pt-3">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">Usuario administrador</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-gray-400 text-xs">Nombre completo *</label>
                        <input value={adminForm.name} onChange={e=>setAdminForm({...adminForm,name:e.target.value})}
                          placeholder="Nombre del admin"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs">Usuario (login) *</label>
                        <input value={adminForm.username} onChange={e=>setAdminForm({...adminForm,username:e.target.value})}
                          placeholder="admin"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-gray-400 text-xs">Contraseña *</label>
                        <input type="password" value={adminForm.password} onChange={e=>setAdminForm({...adminForm,password:e.target.value})}
                          placeholder="Mínimo 8 caracteres"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs mt-1.5">El admin tendrá acceso a todos los módulos del plan seleccionado.</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={()=>{ setShowNewCompany(false); setEditingCompany(null); }}
                className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2.5 text-sm">
                Cancelar
              </button>
              <button onClick={saveCompany}
                disabled={!companyForm.name || (!editingCompany && (!companyForm.slug || !adminForm.username || !adminForm.password)) || saving}
                className="flex-1 bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-emerald-600">
                {saving ? "Guardando..." : editingCompany ? "Guardar cambios" : "Registrar empresa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal plan (crear / editar) ── */}
      {showPlanForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold mb-4">{editingPlan?`Editar: ${editingPlan.name}`:"Nuevo plan"}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs">Nombre *</label>
                <input value={planForm.name} onChange={e=>setPlanForm({...planForm,name:e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs">Descripción</label>
                <input value={planForm.description} onChange={e=>setPlanForm({...planForm,description:e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs">Precio (COP) *</label>
                  <input type="number" value={planForm.price_monthly} onChange={e=>setPlanForm({...planForm,price_monthly:Number(e.target.value)})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                  {planForm.price_monthly>0 && <p className="text-emerald-400 text-xs mt-0.5">${fmt(planForm.price_monthly)} COP</p>}
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Ciclo</label>
                  <select value={planForm.billing_cycle} onChange={e=>setPlanForm({...planForm,billing_cycle:e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1">
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="permanent">Pago único</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Máx. usuarios</label>
                  <input type="number" value={planForm.max_users} onChange={e=>setPlanForm({...planForm,max_users:Number(e.target.value)})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Números WhatsApp</label>
                  <input type="number" value={planForm.max_wa_numbers} onChange={e=>setPlanForm({...planForm,max_wa_numbers:Number(e.target.value)})}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm mt-1 focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-2">Módulos incluidos</label>
                <div className="grid grid-cols-2 gap-1.5 bg-gray-700/50 rounded-xl p-3">
                  {MODULES.map(m=>(
                    <Switch key={m} checked={!!planForm.modules[m]} label={ML[m]}
                      onChange={v=>setPlanForm({...planForm,modules:{...planForm.modules,[m]:v}})} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={()=>{ setShowPlanForm(false); setEditingPlan(null); }} className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2 text-sm">Cancelar</button>
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
