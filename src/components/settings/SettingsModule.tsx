"use client";

import { useState, useEffect } from "react";

type Tab = "company" | "banks" | "smtp" | "learning" | "users" | "drive" | "templates" | "sla";

const MODULE_LIST: { id: string; label: string; icon: string }[] = [
  { id: "chat",       label: "Chat",         icon: "💬" },
  { id: "crm",        label: "CRM",          icon: "👥" },
  { id: "calendar",   label: "Calendario",   icon: "📅" },
  { id: "analytics",  label: "Analytics",    icon: "📊" },
  { id: "accounting", label: "Contabilidad", icon: "💰" },
  { id: "suppliers",  label: "Proveedores",  icon: "🤝" },
  { id: "products",   label: "Productos",    icon: "🛍️" },
  { id: "campaigns",  label: "Campañas",     icon: "📧" },
  { id: "documents",  label: "Documentos",   icon: "📄" },
  { id: "settings",   label: "Ajustes",      icon: "⚙️" },
];

interface BankAccount { id: number; bank_name: string; account_type: string; account_number: string; account_holder: string | null }
interface CompanyConfig { name: string | null; phone: string | null; email: string | null; logo_filename: string | null; business_hours_start: number; business_hours_end: number; business_days: string; ai_name: string | null; ai_general_instructions: string | null; nequi_phone: string | null; daviplata_phone: string | null }
interface SystemUser { id: number; username: string; name: string; permissions: string; is_admin: number; active: number }
interface SmtpConfig { host: string | null; port: number; secure: number; user: string | null; from_name: string | null; from_email: string | null }
interface AiLearning { id: number; topic: string; content: string; created_at: number }
interface EditingLearning { id: number; topic: string; content: string }
interface DriveSource { id: number; name: string; drive_url: string; file_type: string; topic: string; last_synced_at: number | null; sync_status: string; sync_error: string | null }
interface MsgTemplate { id: number; name: string; content: string; category: string | null }

function ModuleToggle({ id, label, icon, checked, onChange }: { id: string; label: string; icon: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => onChange(!checked)}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-emerald-500" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
      <span className="text-sm">{icon}</span>
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  );
}

export default function SettingsModule({ currentUser }: { currentUser?: { role?: string; is_admin?: boolean } | null }) {
  const [tab, setTab] = useState<Tab>("company");
  const [company, setCompany] = useState<CompanyConfig>({ name: "", phone: "", email: "", logo_filename: null, business_hours_start: 8, business_hours_end: 18, business_days: "1,2,3,4,5", ai_name: "Julieta", ai_general_instructions: "", nequi_phone: "", daviplata_phone: "" });
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [newUser, setNewUser] = useState({ username: "", name: "", password: "", permissions: {} as Record<string, boolean>, is_admin: false });
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [smtp, setSmtp] = useState<SmtpConfig>({ host: "", port: 587, secure: 0, user: "", from_name: "", from_email: "" });
  const [learnings, setLearnings] = useState<AiLearning[]>([]);
  const [newLearning, setNewLearning]       = useState({ topic: "", content: "" });
  const [editingLearning, setEditingLearning] = useState<EditingLearning | null>(null);
  const [newBank, setNewBank] = useState({ bank_name: "", account_type: "ahorros", account_number: "", account_holder: "" });
  const [driveSources, setDriveSources] = useState<DriveSource[]>([]);
  const [newDrive, setNewDrive] = useState({ name: "", drive_url: "", topic: "" });
  const [driveSyncing, setDriveSyncing] = useState<number | null>(null);
  const [driveMsg, setDriveMsg] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MsgTemplate[]>([]);
  const [newTpl, setNewTpl] = useState({ name: "", content: "", category: "" });
  const [slaMinutes, setSlaMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isAdmin = currentUser?.is_admin || currentUser?.role === "master";

  useEffect(() => {
    fetch("/api/settings/company").then((r) => r.json()).then((d) => setCompany(d.config));
    fetch("/api/settings/banks").then((r) => r.json()).then((d) => setBanks(d.banks));
    fetch("/api/settings/smtp").then((r) => r.json()).then((d) => setSmtp(d.config));
    fetch("/api/settings/learnings").then((r) => r.json()).then((d) => setLearnings(d.learnings));
    fetch("/api/templates").then((r) => r.json()).then((d) => setTemplates(d.templates ?? []));
    fetch("/api/sla").then((r) => r.json()).then((d) => { if (d.sla_minutes) setSlaMinutes(d.sla_minutes); });
    if (isAdmin) {
      fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
      fetch("/api/settings/drive").then((r) => r.json()).then((d) => setDriveSources(d.sources ?? []));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showSaved() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  async function saveCompany() {
    setSaving(true);
    await fetch("/api/settings/company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(company) });
    setSaving(false); showSaved();
  }

  async function saveSmtp() {
    setSaving(true);
    await fetch("/api/settings/smtp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(smtp) });
    setSaving(false); showSaved();
  }

  async function addBank() {
    if (!newBank.bank_name || !newBank.account_number) return;
    await fetch("/api/settings/banks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBank) });
    setNewBank({ bank_name: "", account_type: "ahorros", account_number: "", account_holder: "" });
    fetch("/api/settings/banks").then((r) => r.json()).then((d) => setBanks(d.banks));
  }

  async function deleteBank(id: number) {
    await fetch(`/api/settings/banks/${id}`, { method: "DELETE" });
    setBanks(banks.filter((b) => b.id !== id));
  }

  async function addLearning() {
    if (!newLearning.topic || !newLearning.content) return;
    await fetch("/api/settings/learnings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newLearning) });
    setNewLearning({ topic: "", content: "" });
    fetch("/api/settings/learnings").then((r) => r.json()).then((d) => setLearnings(d.learnings));
  }

  async function deleteLearning(id: number) {
    if (!confirm("¿Eliminar este conocimiento?")) return;
    await fetch(`/api/settings/learnings/${id}`, { method: "DELETE" });
    setLearnings(learnings.filter((l) => l.id !== id));
  }

  async function saveEditLearning() {
    if (!editingLearning) return;
    await fetch(`/api/settings/learnings/${editingLearning.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: editingLearning.topic, content: editingLearning.content }),
    });
    setLearnings(learnings.map(l => l.id === editingLearning.id ? { ...l, ...editingLearning } : l));
    setEditingLearning(null);
  }

  const aiName = company.ai_name || "Julieta";

  function parsePermissions(raw: string): Record<string, boolean> {
    try { return JSON.parse(raw || "{}"); } catch { return {}; }
  }

  async function addUser() {
    if (!newUser.username || !newUser.name || !newUser.password) return;
    await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newUser) });
    setNewUser({ username: "", name: "", password: "", permissions: {}, is_admin: false });
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
  }

  async function toggleUserActive(id: number, active: number) {
    await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: active === 1 ? 0 : 1 }) });
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
  }

  async function saveUserPermissions(u: SystemUser) {
    const perms = parsePermissions(u.permissions);
    await fetch(`/api/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: perms }) });
    setEditingUser(null);
  }

  async function removeUser(id: number) {
    if (!confirm("¿Eliminar este usuario?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    setUsers(users.filter((u) => u.id !== id));
  }

  function setUserPerm(userId: number, mod: string, value: boolean) {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const perms = parsePermissions(u.permissions);
      return { ...u, permissions: JSON.stringify({ ...perms, [mod]: value }) };
    }));
  }

  async function addDriveSource() {
    if (!newDrive.name || !newDrive.drive_url || !newDrive.topic) return;
    setDriveMsg(null);
    const res = await fetch("/api/settings/drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newDrive) });
    const data = await res.json() as { syncStatus?: string; syncError?: string };
    if (!res.ok) { setDriveMsg(`Error: ${data.syncError ?? "URL no válida"}`); return; }
    if (data.syncStatus === "error") setDriveMsg(`Fuente agregada, pero sincronización falló: ${data.syncError}`);
    else setDriveMsg("Fuente conectada y sincronizada correctamente");
    setNewDrive({ name: "", drive_url: "", topic: "" });
    fetch("/api/settings/drive").then((r) => r.json()).then((d) => setDriveSources(d.sources ?? []));
  }

  async function syncDriveSource(id: number) {
    setDriveSyncing(id); setDriveMsg(null);
    const res = await fetch(`/api/settings/drive/${id}`, { method: "POST" });
    const data = await res.json() as { ok?: boolean; rows?: number; error?: string };
    if (res.ok) setDriveMsg(`Sincronizado: ${data.rows ?? "?"} filas actualizadas`);
    else setDriveMsg(`Error: ${data.error}`);
    setDriveSyncing(null);
    fetch("/api/settings/drive").then((r) => r.json()).then((d) => setDriveSources(d.sources ?? []));
  }

  async function deleteDriveSource(id: number) {
    if (!confirm("¿Eliminar esta fuente? También se eliminará del conocimiento de la IA.")) return;
    await fetch(`/api/settings/drive/${id}`, { method: "DELETE" });
    setDriveSources(driveSources.filter((s) => s.id !== id));
  }

  async function addTemplate() {
    if (!newTpl.name || !newTpl.content) return;
    await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTpl) });
    setNewTpl({ name: "", content: "", category: "" });
    fetch("/api/templates").then(r => r.json()).then(d => setTemplates(d.templates ?? []));
  }
  async function deleteTemplate(id: number) {
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    setTemplates(templates.filter(t => t.id !== id));
  }
  async function saveSla() {
    await fetch("/api/sla", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes: slaMinutes }) });
    showSaved();
  }

  const ALL_TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "company",   label: "Empresa" },
    { id: "banks",     label: "Cuentas bancarias" },
    { id: "smtp",      label: "Email SMTP" },
    { id: "learning",  label: `${aiName} IA` },
    { id: "templates", label: "Plantillas" },
    { id: "sla",       label: "SLA", adminOnly: true },
    { id: "drive",     label: "Google Drive", adminOnly: true },
    { id: "users",     label: "Usuarios", adminOnly: true },
  ];
  const TABS = ALL_TABS.filter((t) => !t.adminOnly || isAdmin) as { id: Tab; label: string }[];

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Configuración</h1>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors min-w-[100px] ${tab === t.id ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EMPRESA ── */}
      {tab === "company" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Nombre de la empresa</label>
              <input value={company.name ?? ""} onChange={(e) => setCompany({ ...company, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Teléfono</label>
              <input value={company.phone ?? ""} onChange={(e) => setCompany({ ...company, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Correo de contacto</label>
              <input value={company.email ?? ""} onChange={(e) => setCompany({ ...company, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Horario de atención del bot</p>
            <div className="flex gap-4 items-center flex-wrap">
              <div>
                <label className="text-xs text-gray-500">Desde (hora)</label>
                <input type="number" min={0} max={23} value={company.business_hours_start}
                  onChange={(e) => setCompany({ ...company, business_hours_start: Number(e.target.value) })}
                  className="w-16 border rounded px-2 py-1 text-sm mt-1 block" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Hasta (hora)</label>
                <input type="number" min={0} max={23} value={company.business_hours_end}
                  onChange={(e) => setCompany({ ...company, business_hours_end: Number(e.target.value) })}
                  className="w-16 border rounded px-2 py-1 text-sm mt-1 block" />
              </div>
              <p className="text-xs text-gray-400 self-end pb-1">Días activos: {company.business_days}<br/>(0=dom · 1=lun · 5=vie · 6=sáb)</p>
            </div>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Pagos QR (Nequi / Daviplata)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Número Nequi</label>
                <input value={company.nequi_phone ?? ""} onChange={(e) => setCompany({...company, nequi_phone: e.target.value})} placeholder="3001234567" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Número Daviplata</label>
                <input value={company.daviplata_phone ?? ""} onChange={(e) => setCompany({...company, daviplata_phone: e.target.value})} placeholder="3001234567" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
            </div>
          </div>
          {company.logo_filename && (
            <img src={`/uploads/logos/${company.logo_filename}`} className="h-16 object-contain rounded border" alt="Logo" />
          )}
          <button onClick={saveCompany} disabled={saving} className="bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
            {saved ? "✓ Guardado" : saving ? "Guardando..." : "Guardar empresa"}
          </button>
        </div>
      )}

      {/* ── BANCOS ── */}
      {tab === "banks" && (
        <div className="space-y-4">
          <div className="space-y-2">
            {banks.length === 0 && <p className="text-gray-400 text-sm">No hay cuentas configuradas.</p>}
            {banks.map((b) => (
              <div key={b.id} className="bg-white border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{b.bank_name}</p>
                  <p className="text-sm text-gray-500">{b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"} · {b.account_number}</p>
                  {b.account_holder && <p className="text-xs text-gray-400">A nombre de: {b.account_holder}</p>}
                </div>
                <button onClick={() => deleteBank(b.id)} className="text-red-400 hover:text-red-600 text-sm">Eliminar</button>
              </div>
            ))}
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Agregar cuenta</p>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Nombre del banco" value={newBank.bank_name} onChange={(e) => setNewBank({ ...newBank, bank_name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <select value={newBank.account_type} onChange={(e) => setNewBank({ ...newBank, account_type: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
                <option value="ahorros">Cuenta de Ahorros</option>
                <option value="corriente">Cuenta Corriente</option>
              </select>
              <input placeholder="Número de cuenta" value={newBank.account_number} onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Titular (opcional)" value={newBank.account_holder} onChange={(e) => setNewBank({ ...newBank, account_holder: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={addBank} className="mt-3 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">+ Agregar cuenta</button>
          </div>
        </div>
      )}

      {/* ── SMTP ── */}
      {tab === "smtp" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
            Compatible con Gmail (usa contraseña de aplicación), Outlook o cualquier servidor SMTP.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Servidor SMTP</label>
              <input value={smtp.host ?? ""} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Puerto</label>
              <input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input type="checkbox" checked={smtp.secure === 1} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked ? 1 : 0 })} id="ssl" />
              <label htmlFor="ssl" className="text-sm text-gray-700">Usar SSL (puerto 465)</label>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Usuario / Email</label>
              <input value={smtp.user ?? ""} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Contraseña de aplicación</label>
              <input type="password" placeholder="••••••••" onChange={(e) => setSmtp({ ...smtp, ...{ password: e.target.value } as unknown as SmtpConfig })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Nombre remitente</label>
              <input value={smtp.from_name ?? ""} onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Email remitente</label>
              <input value={smtp.from_email ?? ""} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
          </div>
          <button onClick={saveSmtp} disabled={saving} className="bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
            {saved ? "✓ Guardado" : saving ? "Guardando..." : "Guardar SMTP"}
          </button>
        </div>
      )}

      {/* ── APRENDIZAJE IA ── */}
      {tab === "learning" && (
        <div className="space-y-6">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🤖</span>
              <h2 className="font-semibold text-purple-800">Identidad y personalidad</h2>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Nombre de la IA</label>
              <input value={company.ai_name ?? "Julieta"} onChange={(e) => setCompany({ ...company, ai_name: e.target.value })} placeholder="Julieta" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Instrucciones generales para {aiName}</label>
              <p className="text-xs text-gray-400 mb-1">Define cómo debe comportarse, tono, qué evitar, quién es la empresa, etc.</p>
              <textarea value={company.ai_general_instructions ?? ""} onChange={(e) => setCompany({ ...company, ai_general_instructions: e.target.value })} rows={6}
                placeholder={`Ej: Eres ${aiName}, asistente virtual de [Empresa]. Habla en español neutro, sé amable y profesional.`}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
            <button onClick={saveCompany} disabled={saving} className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
              {saved ? "✓ Guardado" : saving ? "Guardando..." : `Guardar configuración de ${aiName}`}
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-gray-800">Conocimiento manual</h2>
                <p className="text-xs text-gray-400">{learnings.filter(l => !l.topic.startsWith("[Drive]")).length} items · {aiName} usa esto como contexto</p>
              </div>
            </div>
            <div className="bg-gray-50 border rounded-xl p-4 mb-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">+ Agregar conocimiento</p>
              <input value={newLearning.topic} onChange={(e) => setNewLearning({ ...newLearning, topic: e.target.value })} placeholder="Tema (ej: Política de cancelación)" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <textarea value={newLearning.content} onChange={(e) => setNewLearning({ ...newLearning, content: e.target.value })} rows={3}
                placeholder="Descripción detallada..." className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              <button onClick={addLearning} disabled={!newLearning.topic || !newLearning.content}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">Agregar</button>
            </div>
            {learnings.filter(l => !l.topic.startsWith("[Drive]")).length === 0 && (
              <div className="text-center py-6 text-gray-400 text-sm">{aiName} aún no tiene conocimientos manuales.</div>
            )}
            <div className="space-y-2">
              {learnings.filter(l => !l.topic.startsWith("[Drive]")).map((l) => (
                <div key={l.id} className="bg-white border rounded-xl p-4">
                  {editingLearning?.id === l.id ? (
                    // Edición inline
                    <div className="space-y-2">
                      <input
                        value={editingLearning.topic}
                        onChange={e => setEditingLearning({ ...editingLearning, topic: e.target.value })}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm font-medium"
                        placeholder="Tema"
                      />
                      <textarea
                        value={editingLearning.content}
                        onChange={e => setEditingLearning({ ...editingLearning, content: e.target.value })}
                        rows={4}
                        className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                        placeholder="Contenido"
                      />
                      <div className="flex gap-2">
                        <button onClick={saveEditLearning} className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-purple-700">Guardar</button>
                        <button onClick={() => setEditingLearning(null)} className="border px-4 py-1.5 rounded-lg text-sm text-gray-600">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    // Vista normal
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">{l.topic}</span>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap line-clamp-4">{l.content}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setEditingLearning({ id: l.id, topic: l.topic, content: l.content })}
                          className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded"
                        >✏️</button>
                        <button onClick={() => deleteLearning(l.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">🗑</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PLANTILLAS ── */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
            Las plantillas aparecen en el chat para enviarlas con un clic. Úsalas para respuestas frecuentes.
          </div>
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="bg-white border rounded-xl p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-800 text-sm">{t.name}</p>
                    {t.category && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t.category}</span>}
                  </div>
                  <p className="text-xs text-gray-500 whitespace-pre-wrap">{t.content}</p>
                </div>
                <button onClick={() => deleteTemplate(t.id)} className="text-red-400 hover:text-red-600 text-sm shrink-0">Eliminar</button>
              </div>
            ))}
            {templates.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Sin plantillas todavía.</p>}
          </div>
          <div className="bg-gray-50 border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">+ Nueva plantilla</p>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Nombre (ej: Bienvenida)" value={newTpl.name} onChange={e => setNewTpl({...newTpl, name: e.target.value})} className="border rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Categoría (opcional)" value={newTpl.category} onChange={e => setNewTpl({...newTpl, category: e.target.value})} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <textarea value={newTpl.content} onChange={e => setNewTpl({...newTpl, content: e.target.value})}
              rows={3} placeholder="Texto de la plantilla..." className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            <button onClick={addTemplate} disabled={!newTpl.name || !newTpl.content}
              className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">Agregar plantilla</button>
          </div>
        </div>
      )}

      {/* ── SLA ── */}
      {tab === "sla" && (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <h2 className="font-semibold text-orange-800 mb-1">Tiempo de respuesta SLA</h2>
            <p className="text-sm text-orange-700">Si un agente en modo HUMANO no responde al cliente dentro de este tiempo, aparecerá una alerta en el header del dashboard.</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <label className="text-sm font-medium text-gray-700">Tiempo máximo de respuesta (minutos)</label>
            <div className="flex gap-3 mt-2">
              <input type="number" min={1} max={1440} value={slaMinutes} onChange={e => setSlaMinutes(Number(e.target.value))}
                className="w-32 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={saveSla} className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600">
                {saved ? "✓ Guardado" : "Guardar"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Recomendado: 30 minutos para atención de calidad.</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Link para formulario web de captación</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-100 rounded-lg px-3 py-2 text-gray-600 font-mono break-all">
                {typeof window !== "undefined" ? `${window.location.origin}/form/[slug-de-empresa]` : "/form/[slug]"}
              </code>
            </div>
            <p className="text-xs text-gray-400 mt-1">Comparte este enlace para captar leads que se crean como conversaciones en el sistema.</p>
          </div>
        </div>
      )}

      {/* ── GOOGLE DRIVE ── */}
      {tab === "drive" && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📂</span>
              <h2 className="font-semibold text-blue-800">Fuentes de datos en tiempo real</h2>
            </div>
            <p className="text-sm text-blue-700">
              Conecta hojas de cálculo o documentos de Google Drive. El sistema sincroniza el contenido y lo inyecta en el contexto de {aiName} automáticamente.
            </p>
            <p className="text-xs text-blue-600 mt-1">
              El archivo debe estar compartido como <strong>"Cualquiera con el enlace puede ver"</strong>.
            </p>
          </div>

          {driveMsg && (
            <div className={`rounded-xl px-4 py-3 text-sm ${driveMsg.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
              {driveMsg}
            </div>
          )}

          {/* Fuentes existentes */}
          <div className="space-y-3">
            {driveSources.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No hay fuentes conectadas.</p>}
            {driveSources.map((s) => (
              <div key={s.id} className="bg-white border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{s.file_type === "sheet" ? "📊" : s.file_type === "doc" ? "📄" : "📁"}</span>
                      <p className="font-medium text-gray-800">{s.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.sync_status === "ok" ? "bg-emerald-100 text-emerald-700" : s.sync_status === "error" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                        {s.sync_status === "ok" ? "Sincronizado" : s.sync_status === "error" ? "Error" : "Pendiente"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Tema: <span className="text-purple-600">{s.topic}</span>
                      {s.last_synced_at && <> · Última sync: {new Date(s.last_synced_at * 1000).toLocaleString("es")}</>}
                    </p>
                    {s.sync_error && <p className="text-xs text-red-500 mt-1">{s.sync_error}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => syncDriveSource(s.id)} disabled={driveSyncing === s.id}
                      className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                      {driveSyncing === s.id ? "⏳ Sincronizando..." : "🔄 Sincronizar"}
                    </button>
                    <button onClick={() => deleteDriveSource(s.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5">Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Agregar nueva fuente */}
          <div className="bg-gray-50 border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">+ Conectar nueva fuente</p>
            <div>
              <label className="text-xs text-gray-500">Nombre descriptivo</label>
              <input value={newDrive.name} onChange={(e) => setNewDrive({...newDrive, name: e.target.value})} placeholder="Ej: Reservas 2025, Tarifas hoteleras" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">URL de Google Drive compartida</label>
              <input value={newDrive.drive_url} onChange={(e) => setNewDrive({...newDrive, drive_url: e.target.value})}
                placeholder="https://docs.google.com/spreadsheets/d/..." className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Tema para la IA (¿qué describe este archivo?)</label>
              <input value={newDrive.topic} onChange={(e) => setNewDrive({...newDrive, topic: e.target.value})} placeholder="Ej: Listado de reservas activas, Huéspedes esperados" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
            </div>
            <button onClick={addDriveSource} disabled={!newDrive.name || !newDrive.drive_url || !newDrive.topic}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              Conectar y sincronizar
            </button>
          </div>
        </div>
      )}

      {/* ── USUARIOS ── */}
      {tab === "users" && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
            Activa o desactiva módulos por usuario. Los módulos desactivados se ocultan del menú lateral cuando el usuario inicia sesión.
          </div>

          {/* Lista de usuarios */}
          <div className="space-y-3">
            {users.map((u) => {
              const perms = parsePermissions(u.permissions);
              const isEditing = editingUser === u.id;
              return (
                <div key={u.id} className={`bg-white border rounded-xl p-4 ${!u.active ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                        {u.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-800 text-sm">{u.name}</p>
                          {u.is_admin === 1 && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">Admin</span>}
                        </div>
                        <p className="text-xs text-gray-400">@{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.active ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
                        {u.active ? "Activo" : "Inactivo"}
                      </span>
                      {u.is_admin === 0 && (
                        <>
                          <button onClick={() => setEditingUser(isEditing ? null : u.id)} className="text-xs text-blue-500 hover:text-blue-700">
                            {isEditing ? "Cerrar" : "Permisos"}
                          </button>
                          <button onClick={() => toggleUserActive(u.id, u.active)} className="text-xs text-gray-400 hover:text-gray-600">
                            {u.active ? "Desactivar" : "Activar"}
                          </button>
                          <button onClick={() => removeUser(u.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Módulos que tiene activos (resumen) */}
                  {!isEditing && u.is_admin === 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {MODULE_LIST.filter(m => perms[m.id]).map(m => (
                        <span key={m.id} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{m.icon} {m.label}</span>
                      ))}
                      {MODULE_LIST.filter(m => perms[m.id]).length === 0 && (
                        <span className="text-xs text-gray-400">Sin módulos activos</span>
                      )}
                    </div>
                  )}

                  {/* Panel de edición de permisos */}
                  {isEditing && u.is_admin === 0 && (
                    <div className="mt-3 border-t pt-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Módulos visibles para este usuario</p>
                      <div className="grid grid-cols-2 gap-1">
                        {MODULE_LIST.map(m => (
                          <ModuleToggle key={m.id} id={m.id} label={m.label} icon={m.icon}
                            checked={perms[m.id] === true}
                            onChange={(v) => setUserPerm(u.id, m.id, v)} />
                        ))}
                      </div>
                      <button onClick={() => saveUserPermissions(u)}
                        className="mt-3 bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-600">
                        Guardar permisos
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Crear nuevo usuario */}
          <div className="bg-gray-50 border rounded-xl p-4 space-y-4">
            <p className="text-sm font-medium text-gray-700">+ Crear nuevo usuario</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Usuario (login)</label>
                <input value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} placeholder="carlos.ventas" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Nombre completo</label>
                <input value={newUser.name} onChange={(e) => setNewUser({...newUser, name: e.target.value})} placeholder="Carlos López" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Contraseña temporal</label>
                <input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Módulos que podrá ver</p>
              <div className="grid grid-cols-2 gap-1">
                {MODULE_LIST.map(m => (
                  <ModuleToggle key={m.id} id={m.id} label={m.label} icon={m.icon}
                    checked={newUser.permissions[m.id] === true}
                    onChange={(v) => setNewUser(prev => ({ ...prev, permissions: { ...prev.permissions, [m.id]: v } }))} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_admin" checked={newUser.is_admin} onChange={(e) => setNewUser({...newUser, is_admin: e.target.checked})} />
              <label htmlFor="is_admin" className="text-sm text-gray-700">Administrador (acceso completo + gestión de usuarios)</label>
            </div>
            <button onClick={addUser} disabled={!newUser.username || !newUser.name || !newUser.password}
              className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
              Crear usuario
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
