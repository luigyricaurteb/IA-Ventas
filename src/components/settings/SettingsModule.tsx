"use client";

import { useState, useEffect } from "react";

type Tab = "company" | "banks" | "smtp" | "learning" | "users";

interface BankAccount { id: number; bank_name: string; account_type: string; account_number: string; account_holder: string | null }
interface CompanyConfig { name: string | null; phone: string | null; email: string | null; logo_filename: string | null; business_hours_start: number; business_hours_end: number; business_days: string; ai_name: string | null; ai_general_instructions: string | null; nequi_phone: string | null; daviplata_phone: string | null }
interface SystemUser { id: number; username: string; name: string; role: string; active: number }
interface SmtpConfig { host: string | null; port: number; secure: number; user: string | null; from_name: string | null; from_email: string | null }
interface AiLearning { id: number; topic: string; content: string; created_at: number }

export default function SettingsModule({ currentUser }: { currentUser?: { role: string } | null }) {
  const [tab, setTab] = useState<Tab>("company");
  const [company, setCompany] = useState<CompanyConfig>({ name: "", phone: "", email: "", logo_filename: null, business_hours_start: 8, business_hours_end: 18, business_days: "1,2,3,4,5", ai_name: "Julieta", ai_general_instructions: "", nequi_phone: "", daviplata_phone: "" });
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [newUser, setNewUser] = useState({ username: "", name: "", password: "", role: "ventas" });
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [smtp, setSmtp] = useState<SmtpConfig>({ host: "", port: 587, secure: 0, user: "", from_name: "", from_email: "" });
  const [learnings, setLearnings] = useState<AiLearning[]>([]);
  const [newLearning, setNewLearning] = useState({ topic: "", content: "" });
  const [newBank, setNewBank] = useState({ bank_name: "", account_type: "ahorros", account_number: "", account_holder: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company").then((r) => r.json()).then((d) => setCompany(d.config));
    fetch("/api/settings/banks").then((r) => r.json()).then((d) => setBanks(d.banks));
    fetch("/api/settings/smtp").then((r) => r.json()).then((d) => setSmtp(d.config));
    fetch("/api/settings/learnings").then((r) => r.json()).then((d) => setLearnings(d.learnings));
    if (currentUser?.role === "admin") {
      fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
    }
  }, [currentUser]);

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
    await fetch(`/api/settings/learnings/${id}`, { method: "DELETE" });
    setLearnings(learnings.filter((l) => l.id !== id));
  }

  const aiName = company.ai_name || "Julieta";

  async function addUser() {
    if (!newUser.username || !newUser.name || !newUser.password) return;
    await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newUser) });
    setNewUser({ username: "", name: "", password: "", role: "ventas" });
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
  }
  async function toggleUser(id: number, active: number) {
    await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: active === 1 ? 0 : 1 }) });
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
  }
  async function removeUser(id: number) {
    if (!confirm("¿Eliminar este usuario?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    setUsers(users.filter((u) => u.id !== id));
  }

  const ALL_TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "company",  label: "Empresa" },
    { id: "banks",    label: "Cuentas bancarias" },
    { id: "smtp",     label: "Email SMTP" },
    { id: "learning", label: `Aprendizaje (${aiName})` },
    { id: "users",    label: "Usuarios y roles", adminOnly: true },
  ];
  const TABS = ALL_TABS.filter((t) => !t.adminOnly || currentUser?.role === "admin") as { id: Tab; label: string }[];

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Configuración</h1>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors min-w-[120px] ${tab === t.id ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
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
            <p className="text-xs text-gray-400 mt-1">Estos números aparecerán en el QR del voucher PDF.</p>
          </div>
          {company.logo_filename && (
            <img src={`/uploads/logos/${company.logo_filename}`} className="h-16 object-contain rounded border" />
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

      {/* ── APRENDIZAJE ── */}
      {tab === "learning" && (
        <div className="space-y-6">
          {/* Nombre e instrucciones generales */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🤖</span>
              <h2 className="font-semibold text-purple-800">Identidad y personalidad</h2>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Nombre de la IA</label>
              <input
                value={company.ai_name ?? "Julieta"}
                onChange={(e) => setCompany({ ...company, ai_name: e.target.value })}
                placeholder="Julieta"
                className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Instrucciones generales para {aiName}</label>
              <p className="text-xs text-gray-400 mb-1">
                Define cómo debe comportarse, qué tono usar, qué evitar, quién es la empresa, etc.
              </p>
              <textarea
                value={company.ai_general_instructions ?? ""}
                onChange={(e) => setCompany({ ...company, ai_general_instructions: e.target.value })}
                rows={6}
                placeholder={`Ej: Eres ${aiName}, la asistente virtual de [Empresa DMC]. Tu misión es ayudar a los clientes a encontrar el paquete de viaje ideal. Habla en español neutro, sé amable y profesional. No menciones a la competencia. Cuando el cliente dude, refuerza los beneficios del servicio...`}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>
            <button onClick={saveCompany} disabled={saving} className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
              {saved ? "✓ Guardado" : saving ? "Guardando..." : `Guardar configuración de ${aiName}`}
            </button>
          </div>

          {/* Lista de aprendizajes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-gray-800">Lo que {aiName} ha aprendido</h2>
                <p className="text-xs text-gray-400">{learnings.length} item{learnings.length !== 1 ? "s" : ""} · {aiName} usa esto como contexto al responder</p>
              </div>
            </div>

            {/* Formulario agregar */}
            <div className="bg-gray-50 border rounded-xl p-4 mb-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">+ Agregar nuevo conocimiento</p>
              <input
                value={newLearning.topic}
                onChange={(e) => setNewLearning({ ...newLearning, topic: e.target.value })}
                placeholder="Tema (ej: Paquete Cartagena, Política de cancelación, Temporada alta)"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={newLearning.content}
                onChange={(e) => setNewLearning({ ...newLearning, content: e.target.value })}
                rows={3}
                placeholder={`Ej: El paquete Cartagena incluye 3 noches en hotel 4 estrellas, desayuno, tour de ciudad y traslados. No incluye tiquetes aéreos. La tarifa aplica para máximo 4 personas por habitación.`}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              />
              <button
                onClick={addLearning}
                disabled={!newLearning.topic || !newLearning.content}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
              >
                Agregar
              </button>
            </div>

            {/* Lista */}
            {learnings.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                {aiName} aún no tiene conocimientos registrados.<br />
                Agrega información sobre productos, políticas, preguntas frecuentes, etc.
              </div>
            )}
            <div className="space-y-2">
              {learnings.map((l) => (
                <div key={l.id} className="bg-white border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">{l.topic}</span>
                        <span className="text-xs text-gray-300">
                          {new Date(l.created_at * 1000).toLocaleDateString("es")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{l.content}</p>
                    </div>
                    <button
                      onClick={() => deleteLearning(l.id)}
                      className="text-red-400 hover:text-red-600 text-sm shrink-0"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ── USUARIOS ── */}
      {tab === "users" && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
            ⚠️ Solo los administradores pueden ver y gestionar usuarios. Los cambios son inmediatos.
          </div>

          {/* Lista de usuarios */}
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between ${!u.active ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                    {u.name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{u.name}</p>
                    <p className="text-xs text-gray-400">@{u.username} · <span className="capitalize">{u.role}</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.active ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
                    {u.active ? "Activo" : "Inactivo"}
                  </span>
                  <button onClick={() => toggleUser(u.id, u.active)} className="text-xs text-blue-500 hover:text-blue-700">
                    {u.active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => removeUser(u.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                </div>
              </div>
            ))}
          </div>

          {/* Crear usuario */}
          <div className="bg-gray-50 border rounded-xl p-4 space-y-3">
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
              <div>
                <label className="text-xs text-gray-500">Contraseña temporal</label>
                <input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Rol</label>
                <select value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  <option value="ventas">Ventas — Chat, CRM, Calendario, Productos</option>
                  <option value="contabilidad">Contabilidad — Contabilidad, Proveedores</option>
                  <option value="operaciones">Operaciones — Chat, Calendario, CRM</option>
                  <option value="marketing">Marketing — Campañas, CRM, Analytics</option>
                  <option value="admin">Admin — Todo el sistema</option>
                </select>
              </div>
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
