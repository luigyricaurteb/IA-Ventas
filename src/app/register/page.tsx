"use client";
import { useState, useEffect } from "react";

interface Plan { id: number; name: string; description: string | null; price_monthly: number; billing_cycle: string }

export default function RegisterPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    company_name: "", slug: "", email: "", phone: "", nit: "",
    plan_id: 0, admin_username: "", admin_password: "", admin_confirm: "",
  });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    fetch("/api/public/register").then(r => r.json()).then(d => {
      setPlans(d.plans ?? []);
      if (d.plans?.[0]) setForm(f => ({ ...f, plan_id: d.plans[0].id }));
    });
  }, []);

  // Auto-generate slug from company name
  function handleCompanyName(name: string) {
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
    setForm(f => ({ ...f, company_name: name, slug }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.admin_password !== form.admin_confirm) { setError("Las contraseñas no coinciden"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/public/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: form.company_name, slug: form.slug, email: form.email,
        phone: form.phone, nit: form.nit, plan_id: form.plan_id,
        admin_username: form.admin_username, admin_password: form.admin_password,
      }),
    });
    const d = await res.json() as { ok?: boolean; error?: string };
    if (d.ok) { setSuccess(true); }
    else { setError(d.error ?? "Error al registrar"); }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f172a" }}>
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Registro exitoso!</h2>
          <p className="text-gray-500 mb-6">Tu empresa <strong>{form.company_name}</strong> ha sido registrada y está pendiente de activación. Recibirás un correo cuando esté lista para usar.</p>
          <a href="/login" className="inline-block text-white px-6 py-3 rounded-xl font-semibold" style={{ background: "#0077b6" }}>
            Ir al login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0f172a" }}>
      <div className="max-w-xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-xl mx-auto mb-4" style={{ background: "#0077b6" }}>H</div>
          <h1 className="text-3xl font-bold text-white">Crear cuenta en Aivox</h1>
          <p className="text-slate-400 mt-2">Tu plataforma de ventas y atención al cliente con IA</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1,2,3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${step >= s ? "text-white" : "bg-gray-700 text-gray-400"}`}
                style={step >= s ? { background: "#0077b6" } : {}}>
                {s < step ? "✓" : s}
              </div>
              <span className={`text-xs ${step >= s ? "text-white" : "text-slate-500"}`}>
                {s === 1 ? "Empresa" : s === 2 ? "Plan" : "Acceso"}
              </span>
              {s < 3 && <div className={`flex-1 h-0.5 rounded ${step > s ? "bg-blue-500" : "bg-gray-700"}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">

            {/* Step 1 — Empresa */}
            {step === 1 && (
              <>
                <h2 className="text-white font-semibold text-lg">Datos de la empresa</h2>
                {[
                  { label: "Nombre de la empresa *", key: "company_name", placeholder: "Ej: Beachland Group", onChange: (v: string) => handleCompanyName(v) },
                  { label: "Correo electrónico *", key: "email", placeholder: "correo@empresa.com", type: "email" },
                  { label: "Teléfono", key: "phone", placeholder: "+57 300 0000000" },
                  { label: "NIT / RUC (opcional)", key: "nit", placeholder: "900.000.000-0" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-gray-300 text-sm block mb-1">{f.label}</label>
                    <input type={f.type ?? "text"} value={form[f.key as keyof typeof form] as string}
                      placeholder={f.placeholder} required={f.label.includes("*")}
                      onChange={e => f.onChange ? f.onChange(e.target.value) : setForm({...form, [f.key]: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="text-gray-300 text-sm block mb-1">Identificador único (URL) *</label>
                  <div className="flex items-center bg-gray-700 border border-gray-600 rounded-xl overflow-hidden">
                    <span className="px-3 text-gray-500 text-sm border-r border-gray-600 py-2.5 shrink-0">aivoxgroup.com/</span>
                    <input value={form.slug} onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")})}
                      placeholder="mi-empresa" required
                      className="flex-1 bg-transparent px-3 py-2.5 text-white text-sm focus:outline-none" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Solo letras minúsculas, números y guiones. Mínimo 3 caracteres.</p>
                </div>
                <button type="button" onClick={() => { if (!form.company_name || !form.email || !form.slug) { setError("Completa los campos requeridos"); return; } setError(""); setStep(2); }}
                  className="w-full text-white py-3 rounded-xl font-semibold" style={{ background: "#0077b6" }}>
                  Siguiente →
                </button>
              </>
            )}

            {/* Step 2 — Plan */}
            {step === 2 && (
              <>
                <h2 className="text-white font-semibold text-lg">Elige tu plan</h2>
                <div className="space-y-3">
                  {plans.map(p => (
                    <label key={p.id} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${form.plan_id === p.id ? "border-blue-500 bg-blue-900/30" : "border-gray-600 hover:border-gray-500"}`}>
                      <input type="radio" name="plan" value={p.id} checked={form.plan_id === p.id}
                        onChange={() => setForm({...form, plan_id: p.id})} className="accent-blue-500" />
                      <div className="flex-1">
                        <p className="text-white font-semibold">{p.name}</p>
                        {p.description && <p className="text-gray-400 text-xs mt-0.5">{p.description}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-bold">${p.price_monthly.toLocaleString("es-CO")}</p>
                        <p className="text-gray-400 text-xs">/ mes</p>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 text-center">Los pagos se coordinan con el equipo de Aivox tras el registro.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 border border-gray-600 text-gray-300 py-3 rounded-xl text-sm">← Atrás</button>
                  <button type="button" onClick={() => { setError(""); setStep(3); }} className="flex-1 text-white py-3 rounded-xl font-semibold" style={{ background: "#0077b6" }}>Siguiente →</button>
                </div>
              </>
            )}

            {/* Step 3 — Acceso */}
            {step === 3 && (
              <>
                <h2 className="text-white font-semibold text-lg">Crea tu usuario administrador</h2>
                {[
                  { label: "Usuario *", key: "admin_username", placeholder: "admin" },
                  { label: "Contraseña *", key: "admin_password", type: "password", placeholder: "Mínimo 6 caracteres" },
                  { label: "Confirmar contraseña *", key: "admin_confirm", type: "password", placeholder: "Repite la contraseña" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-gray-300 text-sm block mb-1">{f.label}</label>
                    <input type={f.type ?? "text"} value={form[f.key as keyof typeof form] as string}
                      placeholder={f.placeholder} required minLength={f.key.includes("password") || f.key === "admin_confirm" ? 6 : 1}
                      onChange={e => setForm({...form, [f.key]: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                ))}
                {error && <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-xl">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 border border-gray-600 text-gray-300 py-3 rounded-xl text-sm">← Atrás</button>
                  <button type="submit" disabled={loading} className="flex-1 text-white py-3 rounded-xl font-semibold disabled:opacity-50" style={{ background: "#0077b6" }}>
                    {loading ? "Registrando..." : "Crear cuenta 🚀"}
                  </button>
                </div>
              </>
            )}

            {step < 3 && error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        </form>

        <p className="text-center text-slate-500 text-sm mt-6">
          ¿Ya tienes cuenta? <a href="/login" className="text-blue-400 hover:text-blue-300">Inicia sesión</a>
        </p>
      </div>
    </div>
  );
}
