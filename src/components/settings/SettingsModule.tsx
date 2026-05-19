"use client";

import { useState, useEffect, useRef } from "react";
import WhatsAppConfigPanel from "./WhatsAppConfigPanel";

type Tab = "company" | "whatsapp" | "banks" | "smtp" | "learning" | "users" | "drive" | "templates" | "sla" | "sheets";

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
interface CompanyConfig { name: string | null; phone: string | null; email: string | null; logo_filename: string | null; business_hours_start: number; business_hours_end: number; business_days: string; ai_name: string | null; ai_general_instructions: string | null; nequi_phone: string | null; daviplata_phone: string | null; notify_new_conversation: number; notify_new_payment: number; notify_new_reservation: number }
interface SystemUser { id: number; username: string; name: string; permissions: string; is_admin: number; active: number }
interface SmtpConfig { host: string | null; port: number; secure: number; user: string | null; from_name: string | null; from_email: string | null; provider?: string; resend_api_key?: string; resend_from?: string }
interface AiLearning { id: number; topic: string; content: string; created_at: number; source?: string }
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

export default function SettingsModule({ currentUser }: { currentUser?: { role?: string; is_admin?: boolean; company?: string } | null }) {
  const [tab, setTab] = useState<Tab>("company");
  const companySlug = (currentUser as { company?: string } | null | undefined)?.company ?? "";
  const [company, setCompany] = useState<CompanyConfig>({ name: "", phone: "", email: "", logo_filename: null, business_hours_start: 8, business_hours_end: 18, business_days: "1,2,3,4,5", ai_name: "Julieta", ai_general_instructions: "", nequi_phone: "", daviplata_phone: "", notify_new_conversation: 1, notify_new_payment: 1, notify_new_reservation: 1 });

  // WhatsApp state
  const [waStatus, setWaStatus] = useState<"disconnected"|"qr"|"connecting"|"connected">("disconnected");
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waDisconnecting, setWaDisconnecting] = useState(false);
  const [waRestarting, setWaRestarting] = useState(false);
  const waPollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [newUser, setNewUser] = useState({ username: "", name: "", password: "", permissions: {} as Record<string, boolean>, is_admin: false });
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editUserModal, setEditUserModal] = useState<{ id: number; name: string; password: string; is_admin: boolean } | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [smtp, setSmtp] = useState<SmtpConfig>({ host: "", port: 587, secure: 0, user: "", from_name: "", from_email: "", provider: "smtp", resend_api_key: "", resend_from: "" });
  const [learnings, setLearnings] = useState<AiLearning[]>([]);
  const [newLearning, setNewLearning]       = useState({ topic: "", content: "" });
  const [editingLearning, setEditingLearning] = useState<EditingLearning | null>(null);
  const [newBank, setNewBank] = useState({ bank_name: "", account_type: "ahorros", account_number: "", account_holder: "" });
  const [driveSources, setDriveSources] = useState<DriveSource[]>([]);
  const [newDrive, setNewDrive] = useState({ name: "", drive_url: "", topic: "" });
  const [driveSyncing, setDriveSyncing] = useState<number | null>(null);
  const [driveMsg, setDriveMsg] = useState<string | null>(null);
  const [sheetsConfig, setSheetsConfig] = useState<{ sheets_url: string; sheets_enabled: boolean; sheets_last_sync: number | null; service_account_email: string }>({ sheets_url: "", sheets_enabled: false, sheets_last_sync: null, service_account_email: "" });
  const [showAutoLearnings, setShowAutoLearnings] = useState(false);
  const [sheetsSaving, setSheetsSaving] = useState(false);
  const [sheetsTesting, setSheetsTesting] = useState(false);
  const [sheetsSyncing, setSheetsSyncing] = useState(false);
  const [sheetsMsg, setSheetsMsg] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MsgTemplate[]>([]);
  const [newTpl, setNewTpl] = useState({ name: "", content: "", category: "" });
  const [slaMinutes, setSlaMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isAdmin = currentUser?.is_admin || currentUser?.role === "master";

  // ── WhatsApp polling (solo cuando el tab está activo) ─────────────────────
  useEffect(() => {
    if (tab !== "whatsapp") {
      if (waPollerRef.current) { clearInterval(waPollerRef.current); waPollerRef.current = null; }
      return;
    }
    async function fetchWa() {
      try {
        const d = await fetch("/api/connection/status").then(r => r.json()) as { status: string; phone?: string; qrPng?: string };
        setWaStatus(d.status as typeof waStatus);
        setWaPhone(d.phone ?? null);
        setWaQr(d.qrPng ?? null);
      } catch {}
    }
    fetchWa();
    waPollerRef.current = setInterval(fetchWa, 2000);
    return () => { if (waPollerRef.current) clearInterval(waPollerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function testSmtp() {
    setSmtpTesting(true); setSmtpTestResult(null);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const res = await fetch("/api/settings/smtp/test", { method: "POST", signal: abort.signal });
      const d = await res.json() as { ok: boolean; sentTo?: string; error?: string };
      setSmtpTestResult({ ok: d.ok, msg: d.ok ? `✅ Email enviado a ${d.sentTo}` : `❌ ${d.error}` });
    } catch (e: unknown) {
      const isAbort = (e as {name?: string}).name === "AbortError";
      setSmtpTestResult({ ok: false, msg: isAbort ? "❌ Tiempo agotado (15s). Verifica que el host y puerto sean correctos." : `❌ Error de conexión` });
    } finally {
      clearTimeout(timeout);
      setSmtpTesting(false);
    }
  }

  async function disconnectWa() {
    if (!confirm("¿Desconectar WhatsApp? El bot dejará de funcionar hasta que escanees el QR nuevamente.")) return;
    setWaDisconnecting(true);
    await fetch("/api/connection/disconnect", { method: "POST" });
    setWaStatus("disconnected"); setWaPhone(null); setWaQr(null);
    setWaDisconnecting(false);
  }

  async function restartWa() {
    setWaRestarting(true);
    setWaQr(null); setWaPhone(null); setWaStatus("disconnected");
    await fetch("/api/connection/restart", { method: "POST" });
    // Esperar 3s y empezar a hacer poll para el QR
    setTimeout(() => setWaRestarting(false), 3000);
  }

  useEffect(() => {
    fetch("/api/settings/company").then((r) => r.json()).then((d) => setCompany(d.config));
    fetch("/api/settings/banks").then((r) => r.json()).then((d) => setBanks(d.banks));
    fetch("/api/settings/smtp").then((r) => r.json()).then((d) => setSmtp(d.config));
    fetch("/api/settings/learnings").then((r) => r.json()).then((d) => setLearnings(d.learnings));
    fetch("/api/templates").then((r) => r.json()).then((d) => setTemplates(d.templates ?? []));
    fetch("/api/sla").then((r) => r.json()).then((d) => { if (d.sla_minutes) setSlaMinutes(d.sla_minutes); });
    fetch("/api/settings/sheets").then((r) => r.json()).then((d) => setSheetsConfig({ sheets_url: d.sheets_url ?? "", sheets_enabled: d.sheets_enabled ?? false, sheets_last_sync: d.sheets_last_sync ?? null, service_account_email: d.service_account_email ?? "" }));
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
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json() as { error?: string }; alert(d.error ?? "Error al eliminar"); return; }
    setUsers(users.filter((u) => u.id !== id));
  }

  async function saveEditUser() {
    if (!editUserModal) return;
    const body: Record<string, unknown> = { name: editUserModal.name, is_admin: editUserModal.is_admin };
    if (editUserModal.password) body.password = editUserModal.password;
    await fetch(`/api/users/${editUserModal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setUsers(users.map(u => u.id === editUserModal.id ? { ...u, name: editUserModal.name, is_admin: editUserModal.is_admin ? 1 : 0 } : u));
    setEditUserModal(null);
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
    { id: "whatsapp",  label: "☁️ Meta" },
    { id: "banks",     label: "Cuentas bancarias" },
    { id: "smtp",      label: "Email SMTP" },
    { id: "learning",  label: `${aiName} IA` },
    { id: "templates", label: "Plantillas" },
    { id: "sla",       label: "SLA", adminOnly: true },
    { id: "drive",     label: "Google Drive", adminOnly: true },
    { id: "sheets",    label: "📊 Google Sheets" },
    { id: "users",     label: "Usuarios", adminOnly: true },
  ];
  const TABS = ALL_TABS.filter((t) => !t.adminOnly || isAdmin) as { id: Tab; label: string }[];

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 max-w-3xl w-full">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Configuración</h1>
      {/* Tabs — scroll horizontal en móvil */}
      <div className="overflow-x-auto mb-6 -mx-4 md:mx-0 px-4 md:px-0">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 min-w-max md:min-w-0 md:flex-wrap">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-2 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${tab === t.id ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
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

          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-1">Notificaciones por email</p>
            <p className="text-xs text-gray-400 mb-3">
              Se envían al correo de contacto configurado arriba. Requiere SMTP configurado en la pestaña <strong>Email SMTP</strong>.
            </p>
            <div className="space-y-2">
              {([
                { key: "notify_new_conversation" as const, icon: "💬", label: "Nueva conversación de WhatsApp" },
                { key: "notify_new_payment"      as const, icon: "💰", label: "Pago aprobado" },
                { key: "notify_new_reservation"  as const, icon: "📅", label: "Nueva reserva creada" },
              ] as const).map(({ key, icon, label }) => (
                <ModuleToggle key={key} id={key} icon={icon} label={label}
                  checked={company[key] === 1}
                  onChange={v => setCompany({ ...company, [key]: v ? 1 : 0 })} />
              ))}
            </div>
          </div>

          <button onClick={saveCompany} disabled={saving} className="bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
            {saved ? "✓ Guardado" : saving ? "Guardando..." : "Guardar empresa"}
          </button>
        </div>
      )}

      {/* ── WHATSAPP ── */}
      {tab === "whatsapp" && (
        <WhatsAppConfigPanel />
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
          {/* Selector de proveedor */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Proveedor de email</label>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setSmtp({...smtp, provider: "brevo"})}
                className={`border-2 rounded-xl p-3 text-left transition-colors ${smtp.provider === "brevo" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-gray-300"}`}>
                <p className="font-semibold text-gray-800 text-sm">✉️ Brevo</p>
                <p className="text-xs text-gray-500 mt-0.5">Sin dominio propio</p>
                <p className="text-xs text-emerald-600 mt-1">Gratis: 300/día</p>
              </button>
              <button onClick={() => setSmtp({...smtp, provider: "resend"})}
                className={`border-2 rounded-xl p-3 text-left transition-colors ${smtp.provider === "resend" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-gray-300"}`}>
                <p className="font-semibold text-gray-800 text-sm">🚀 Resend</p>
                <p className="text-xs text-gray-500 mt-0.5">Dominio propio</p>
                <p className="text-xs text-emerald-600 mt-1">Gratis: 3.000/mes</p>
              </button>
              <button onClick={() => setSmtp({...smtp, provider: "smtp"})}
                className={`border-2 rounded-xl p-3 text-left transition-colors ${smtp.provider === "smtp" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-gray-300"}`}>
                <p className="font-semibold text-gray-800 text-sm">📬 SMTP</p>
                <p className="text-xs text-gray-500 mt-0.5">Servidor propio</p>
                <p className="text-xs text-orange-500 mt-1">Bloqueado en Railway</p>
              </button>
            </div>
          </div>

          {/* Brevo */}
          {smtp.provider === "brevo" && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 space-y-1">
                <p className="font-semibold">✅ Brevo funciona sin dominio propio</p>
                <p className="text-xs">Puedes enviar desde tu Gmail directamente. 300 emails/día gratis.</p>
                <ol className="list-decimal list-inside space-y-1 text-xs mt-2">
                  <li>Ve a <strong>brevo.com</strong> → crea cuenta gratuita con tu Gmail</li>
                  <li>Dashboard → <strong>SMTP & API</strong> → pestaña <strong>API</strong></li>
                  <li>Clic en <strong>Generate a new API key</strong> → cópiala</li>
                  <li>Pega aquí abajo y guarda</li>
                </ol>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">API Key de Brevo *</label>
                  <input type="password" placeholder="xkeysib-••••••••••••••••••••••••••"
                    onChange={(e) => setSmtp({...smtp, resend_api_key: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Email remitente (from)</label>
                  <input value={smtp.resend_from ?? ""} onChange={(e) => setSmtp({...smtp, resend_from: e.target.value})}
                    placeholder="infobeachlandgroup@gmail.com"
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                  <p className="text-xs text-gray-500 mt-1">Usa el mismo email con que te registraste en Brevo</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Nombre remitente</label>
                  <input value={smtp.from_name ?? ""} onChange={(e) => setSmtp({...smtp, from_name: e.target.value})}
                    placeholder="Hivo Alertas" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* Resend */}
          {smtp.provider === "resend" && (
            <div className="space-y-4">
              {/* Explicación clave — from vs to */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-3">
                <p className="font-semibold">📌 Importante — dos emails distintos:</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <p className="font-semibold text-blue-700 mb-1">📤 Email que ENVÍA (remitente)</p>
                    <p className="text-gray-600">Debe ser de un dominio verificado en Resend.</p>
                    <p className="text-gray-500 mt-1">Para pruebas: usa <strong>onboarding@resend.dev</strong></p>
                    <p className="text-orange-600 mt-1 font-medium">❌ No uses Gmail aquí</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <p className="font-semibold text-emerald-700 mb-1">📥 Email que RECIBE (destinatario)</p>
                    <p className="text-gray-600">Cualquier correo, incluyendo Gmail.</p>
                    <p className="text-gray-500 mt-1">Se configura en <strong>Ajustes → Empresa → Correo de contacto</strong></p>
                    <p className="text-emerald-600 mt-1 font-medium">✅ Aquí sí puedes poner tu Gmail</p>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 space-y-1">
                <p className="font-semibold">Cómo obtener tu API Key (gratis):</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Ve a <strong>resend.com</strong> → Crear cuenta gratuita</li>
                  <li>Dashboard → <strong>API Keys</strong> → Create API Key</li>
                  <li>Pega la key aquí abajo y guarda</li>
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">API Key de Resend *</label>
                  <input type="password" placeholder="re_••••••••••••••••••••••••••"
                    onChange={(e) => setSmtp({...smtp, resend_api_key: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Email remitente (from)</label>
                  <input value={smtp.resend_from ?? ""} onChange={(e) => setSmtp({...smtp, resend_from: e.target.value})}
                    placeholder="onboarding@resend.dev" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                  <p className="text-xs text-orange-500 mt-1 font-medium">⚠️ Usa onboarding@resend.dev — no Gmail</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Nombre remitente</label>
                  <input value={smtp.from_name ?? ""} onChange={(e) => setSmtp({...smtp, from_name: e.target.value})}
                    placeholder="Vyara Group" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              </div>
            </div>
          )}

          {/* SMTP tradicional */}
          {smtp.provider === "smtp" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                ⚠️ Railway bloquea los puertos SMTP (587, 465). Si tienes problemas de conexión, usa <strong>Resend</strong> en su lugar.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">Servidor SMTP</label>
                  <input value={smtp.host ?? ""} onChange={(e) => setSmtp({...smtp, host: e.target.value})} placeholder="smtp.gmail.com" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Puerto</label>
                  <input type="number" value={smtp.port} onChange={(e) => setSmtp({...smtp, port: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={smtp.secure === 1} onChange={(e) => setSmtp({...smtp, secure: e.target.checked ? 1 : 0})} id="ssl" />
                  <label htmlFor="ssl" className="text-sm text-gray-700">Usar SSL (puerto 465)</label>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Usuario / Email</label>
                  <input value={smtp.user ?? ""} onChange={(e) => setSmtp({...smtp, user: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Contraseña de aplicación</label>
                  <input type="password" placeholder="••••••••" onChange={(e) => setSmtp({...smtp, ...{ password: e.target.value } as unknown as SmtpConfig})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Nombre remitente</label>
                  <input value={smtp.from_name ?? ""} onChange={(e) => setSmtp({...smtp, from_name: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Email remitente</label>
                  <input value={smtp.from_email ?? ""} onChange={(e) => setSmtp({...smtp, from_email: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              </div>
            </div>
          )}
          {smtpTestResult && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${smtpTestResult.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {smtpTestResult.msg}
              {!smtpTestResult.ok && smtpTestResult.msg.includes("Correo de contacto") && (
                <p className="text-xs mt-1 font-normal">Ve a la pestaña <strong>Empresa</strong> y llena el campo <strong>Correo de contacto</strong> — ese es el email que recibe las alertas.</p>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={saveSmtp} disabled={saving} className="bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
              {saved ? "✓ Guardado" : saving ? "Guardando..." : "Guardar SMTP"}
            </button>
            <button onClick={testSmtp} disabled={smtpTesting} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {smtpTesting ? "Probando..." : "📧 Probar conexión"}
            </button>
          </div>
        </div>
      )}

      {/* ── APRENDIZAJE IA ── */}
      {tab === "learning" && (() => {
        const visibleLearnings = learnings.filter(l => !l.topic.startsWith("[Drive]"));
        const autoLearnings    = visibleLearnings.filter(l => l.source === "auto" || l.topic.startsWith("[Auto]"));
        const manualLearnings  = visibleLearnings.filter(l => l.source !== "auto" && !l.topic.startsWith("[Auto]"));
        return (
        <div className="space-y-6">
          {/* Identidad y personalidad */}
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

          {/* Aprendizajes automáticos — colapsable */}
          {(() => {
            const PREVIEW = 3;
            const visible = showAutoLearnings ? autoLearnings : autoLearnings.slice(0, PREVIEW);
            return (
              <div className="border border-blue-100 rounded-xl overflow-hidden">
                {/* Header clicable */}
                <button
                  onClick={() => setShowAutoLearnings(!showAutoLearnings)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 text-sm">🧠 Aprendizaje autónomo</span>
                    <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full">{autoLearnings.length} patrones</span>
                  </div>
                  <span className="text-gray-400 text-sm">{showAutoLearnings ? "▲" : "▼"}</span>
                </button>

                {/* Contenido colapsable */}
                {showAutoLearnings && (
                  <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                    <p className="text-xs text-gray-400">{aiName} aprende de conversaciones. Puedes editar o eliminar patrones.</p>
                    {autoLearnings.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">Aún no hay patrones aprendidos.</p>
                    ) : (
                      visible.map((l) => (
                        <div key={l.id} className="bg-white border border-blue-100 rounded-lg p-3">
                          {editingLearning?.id === l.id ? (
                            <div className="space-y-2">
                              <input value={editingLearning.topic} onChange={e => setEditingLearning({ ...editingLearning, topic: e.target.value })}
                                className="w-full border rounded px-2 py-1 text-xs font-medium" />
                              <textarea value={editingLearning.content} onChange={e => setEditingLearning({ ...editingLearning, content: e.target.value })}
                                rows={2} className="w-full border rounded px-2 py-1 text-xs resize-none" />
                              <div className="flex gap-1">
                                <button onClick={saveEditLearning} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Guardar</button>
                                <button onClick={() => setEditingLearning(null)} className="border px-3 py-1 rounded text-xs text-gray-600">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-[11px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{l.topic.replace("[Auto] ","")}</span>
                                  <span className="text-[10px] text-blue-300">{new Date(l.created_at * 1000).toLocaleDateString("es-CO")}</span>
                                </div>
                                <p className="text-xs text-gray-600 line-clamp-2">{l.content}</p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => setEditingLearning({ id: l.id, topic: l.topic, content: l.content })} className="text-blue-400 hover:text-blue-600 p-1 rounded text-xs">✏️</button>
                                <button onClick={() => deleteLearning(l.id)} className="text-red-300 hover:text-red-500 p-1 rounded text-xs">🗑</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    {!showAutoLearnings && autoLearnings.length > PREVIEW && (
                      <button onClick={() => setShowAutoLearnings(true)} className="w-full text-xs text-blue-500 py-1">Ver {autoLearnings.length - PREVIEW} más...</button>
                    )}
                  </div>
                )}

                {/* Preview cerrado — resumen compacto */}
                {!showAutoLearnings && autoLearnings.length > 0 && (
                  <div className="px-4 py-2 flex flex-wrap gap-1.5">
                    {autoLearnings.slice(0, 5).map(l => (
                      <span key={l.id} className="text-[11px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                        {l.topic.replace("[Auto] ","").slice(0, 25)}
                      </span>
                    ))}
                    {autoLearnings.length > 5 && <span className="text-[11px] text-gray-400">+{autoLearnings.length - 5} más</span>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Conocimiento manual */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-semibold text-gray-800">📝 Conocimiento manual</h2>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{manualLearnings.length} items</span>
            </div>
            <div className="bg-gray-50 border rounded-xl p-4 mb-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">+ Agregar conocimiento</p>
              <input value={newLearning.topic} onChange={(e) => setNewLearning({ ...newLearning, topic: e.target.value })} placeholder="Tema (ej: Política de cancelación)" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <textarea value={newLearning.content} onChange={(e) => setNewLearning({ ...newLearning, content: e.target.value })} rows={3}
                placeholder="Descripción detallada..." className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              <button onClick={addLearning} disabled={!newLearning.topic || !newLearning.content}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">Agregar</button>
            </div>
            {manualLearnings.length === 0 && (
              <div className="text-center py-4 text-gray-400 text-sm">{aiName} aún no tiene conocimientos manuales.</div>
            )}
            <div className="space-y-2">
              {manualLearnings.map((l) => (
                <div key={l.id} className="bg-white border rounded-xl p-4">
                  {editingLearning?.id === l.id ? (
                    <div className="space-y-2">
                      <input value={editingLearning.topic} onChange={e => setEditingLearning({ ...editingLearning, topic: e.target.value })}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm font-medium" placeholder="Tema" />
                      <textarea value={editingLearning.content} onChange={e => setEditingLearning({ ...editingLearning, content: e.target.value })}
                        rows={4} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" placeholder="Contenido" />
                      <div className="flex gap-2">
                        <button onClick={saveEditLearning} className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-purple-700">Guardar</button>
                        <button onClick={() => setEditingLearning(null)} className="border px-4 py-1.5 rounded-lg text-sm text-gray-600">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">{l.topic}</span>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap line-clamp-4">{l.content}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditingLearning({ id: l.id, topic: l.topic, content: l.content })} className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded">✏️</button>
                        <button onClick={() => deleteLearning(l.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">🗑</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        );
      })()}

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
          {companySlug && (
            <div className="bg-white border rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Formulario web de captación de leads</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-100 rounded-lg px-3 py-2 text-gray-600 font-mono break-all">
                  {typeof window !== "undefined" ? `${window.location.origin}/form/${companySlug}` : `/form/${companySlug}`}
                </code>
                <button onClick={() => typeof window !== "undefined" && navigator.clipboard.writeText(`${window.location.origin}/form/${companySlug}`)}
                  className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-2 rounded-lg shrink-0">
                  Copiar
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Comparte este enlace para captar leads. Cada formulario enviado crea una conversación en el sistema automáticamente.</p>
            </div>
          )}
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

          {/* Modal editar usuario */}
          {editUserModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <h3 className="font-semibold text-gray-800">Editar usuario</h3>
                <div>
                  <label className="text-xs text-gray-500">Nombre completo</label>
                  <input value={editUserModal.name} onChange={e => setEditUserModal({...editUserModal, name: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Nueva contraseña (dejar vacío para no cambiar)</label>
                  <input type="password" value={editUserModal.password} onChange={e => setEditUserModal({...editUserModal, password: e.target.value})}
                    placeholder="••••••••" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="editIsAdmin" checked={editUserModal.is_admin}
                    onChange={e => setEditUserModal({...editUserModal, is_admin: e.target.checked})} />
                  <label htmlFor="editIsAdmin" className="text-sm text-gray-700">Administrador</label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEditUserModal(null)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancelar</button>
                  <button onClick={saveEditUser} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600">Guardar</button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de usuarios */}
          <div className="space-y-3">
            {users.map((u) => {
              const perms = parsePermissions(u.permissions);
              const isEditing = editingUser === u.id;
              const isSelf = currentUser && String((currentUser as { id?: number | string }).id) === String(u.id);
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
                          {isSelf && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Tú</span>}
                        </div>
                        <p className="text-xs text-gray-400">@{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.active ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
                        {u.active ? "Activo" : "Inactivo"}
                      </span>
                      <button onClick={() => setEditUserModal({ id: u.id, name: u.name, password: "", is_admin: u.is_admin === 1 })}
                        className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50">✏️ Editar</button>
                      {u.is_admin === 0 && (
                        <button onClick={() => setEditingUser(isEditing ? null : u.id)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border hover:bg-gray-50">
                          {isEditing ? "Cerrar" : "Permisos"}
                        </button>
                      )}
                      <button onClick={() => toggleUserActive(u.id, u.active)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border hover:bg-gray-50">
                        {u.active ? "Desactivar" : "Activar"}
                      </button>
                      {!isSelf && (
                        <button onClick={() => removeUser(u.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded border border-red-200 hover:bg-red-50">🗑 Eliminar</button>
                      )}
                    </div>
                  </div>

                  {/* Módulos activos (resumen, solo no-admins) */}
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

                  {/* Panel de permisos (solo no-admins) */}
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

      {/* ── GOOGLE SHEETS ── */}
      {tab === "sheets" && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <h3 className="font-semibold text-emerald-800 mb-1">📊 Sincronización con Google Sheets</h3>
            <p className="text-sm text-emerald-700">Cada reserva creada o actualizada se agrega automáticamente a tu hoja de cálculo.</p>
          </div>

          {/* Paso 1: Compartir la hoja */}
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h4 className="font-semibold text-gray-800">Paso 1 — Comparte tu hoja con Hivo</h4>
            <p className="text-sm text-gray-600">Abre tu Google Sheet → botón <strong>Compartir</strong> → agrega este correo como <strong>Editor</strong>:</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
              <code className="text-sm text-emerald-700 font-mono flex-1 break-all">{sheetsConfig.service_account_email || "cargando..."}</code>
              <button onClick={() => { navigator.clipboard.writeText(sheetsConfig.service_account_email); setSheetsMsg("Copiado"); setTimeout(() => setSheetsMsg(null), 2000); }}
                className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200 whitespace-nowrap">
                Copiar
              </button>
            </div>
          </div>

          {/* Paso 2: Link de la hoja */}
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h4 className="font-semibold text-gray-800">Paso 2 — Pega el link de tu Google Sheet</h4>
            <p className="text-sm text-gray-500">Ejemplo: https://docs.google.com/spreadsheets/d/1ABC.../edit</p>
            <input
              value={sheetsConfig.sheets_url}
              onChange={(e) => setSheetsConfig({ ...sheetsConfig, sheets_url: e.target.value })}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={async () => {
                  setSheetsTesting(true); setSheetsMsg(null);
                  const res = await fetch("/api/settings/sheets/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheets_url: sheetsConfig.sheets_url }) });
                  const d = await res.json() as { ok: boolean; title?: string; error?: string };
                  setSheetsMsg(d.ok ? `✅ Conexión exitosa: "${d.title}"` : `❌ ${d.error}`);
                  setSheetsTesting(false);
                }}
                disabled={sheetsTesting || !sheetsConfig.sheets_url}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50">
                {sheetsTesting ? "Verificando..." : "Verificar conexión"}
              </button>
              <button
                onClick={async () => {
                  setSheetsSaving(true); setSheetsMsg(null);
                  await fetch("/api/settings/sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheets_url: sheetsConfig.sheets_url, sheets_enabled: sheetsConfig.sheets_enabled }) });
                  setSheetsMsg("✅ Configuración guardada");
                  setSheetsSaving(false);
                }}
                disabled={sheetsSaving}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                {sheetsSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>

          {/* Activar sync + acciones */}
          <div className="bg-white border rounded-xl p-4 space-y-4">
            <h4 className="font-semibold text-gray-800">Paso 3 — Activar sincronización</h4>
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button"
                onClick={async () => {
                  const newVal = !sheetsConfig.sheets_enabled;
                  setSheetsConfig({ ...sheetsConfig, sheets_enabled: newVal });
                  await fetch("/api/settings/sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sheets_enabled: newVal }) });
                  setSheetsMsg(newVal ? "✅ Sincronización activada" : "Sincronización desactivada");
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${sheetsConfig.sheets_enabled ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${sheetsConfig.sheets_enabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <span className="text-sm text-gray-700">Sincronización automática activa</span>
            </label>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={async () => {
                  setSheetsSyncing(true); setSheetsMsg(null);
                  const res = await fetch("/api/settings/sheets/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export" }) });
                  const d = await res.json() as { ok: boolean; exported?: number; error?: string };
                  setSheetsMsg(d.ok ? `✅ ${d.exported} reservas exportadas a la hoja` : `❌ ${d.error}`);
                  if (d.ok) fetch("/api/settings/sheets").then(r => r.json()).then(d => setSheetsConfig(prev => ({ ...prev, sheets_last_sync: (d as { sheets_last_sync: number }).sheets_last_sync })));
                  setSheetsSyncing(false);
                }}
                disabled={sheetsSyncing || !sheetsConfig.sheets_url}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                {sheetsSyncing ? "Exportando..." : "⬆️ Exportar todas las reservas"}
              </button>
              <button
                onClick={async () => {
                  if (!confirm("¿Importar reservas desde la hoja? Solo importa filas que no existan en el sistema.")) return;
                  setSheetsSyncing(true); setSheetsMsg(null);
                  const res = await fetch("/api/settings/sheets/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import" }) });
                  const d = await res.json() as { ok: boolean; imported?: number; skipped?: number; error?: string };
                  setSheetsMsg(d.ok ? `✅ Importadas: ${d.imported}, omitidas (ya existían): ${d.skipped}` : `❌ ${d.error}`);
                  setSheetsSyncing(false);
                }}
                disabled={sheetsSyncing || !sheetsConfig.sheets_url}
                className="bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-50">
                {sheetsSyncing ? "Importando..." : "⬇️ Importar desde la hoja"}
              </button>
            </div>

            {sheetsConfig.sheets_last_sync && (
              <p className="text-xs text-gray-400">Última sincronización: {new Date(sheetsConfig.sheets_last_sync * 1000).toLocaleString("es-CO")}</p>
            )}
          </div>

          {sheetsMsg && (
            <div className={`rounded-xl p-3 text-sm ${sheetsMsg.startsWith("✅") || sheetsMsg === "Copiado" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {sheetsMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
