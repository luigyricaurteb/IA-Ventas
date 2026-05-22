"use client";
import { useState, useEffect } from "react";

interface Plan { id: number; name: string; description: string | null; price_monthly: number }
interface BankAccount { bank_name: string; account_type: string; account_number: string; account_holder: string | null }
interface PaymentOptions {
  wompi_active: boolean; wompi_public_key: string | null;
  banks: BankAccount[]; nequi_phone: string | null; daviplata_phone: string | null;
}
interface WompiData { reference: string; integrity: string; amount_in_cents: number; redirect_url: string }

export default function RegisterPage() {
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [payOpts, setPayOpts] = useState<PaymentOptions>({ wompi_active: false, wompi_public_key: null, banks: [], nequi_phone: null, daviplata_phone: null });
  const [step, setStep]       = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm]       = useState({ company_name:"", slug:"", email:"", phone:"", nit:"", plan_id:0, admin_username:"", admin_password:"", admin_confirm:"" });
  const [payMethod, setPayMethod] = useState<"card" | "transfer">("card");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofAmount, setProofAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [registered, setRegistered] = useState<{ slug: string; wompi: WompiData | null; wompi_public_key: string | null; company_id: number; plan_name: string; plan_amount: number } | null>(null);
  const [proofSent, setProofSent]   = useState(false);

  useEffect(() => {
    fetch("/api/public/register").then(r => r.json()).then((d: { plans: Plan[] } & PaymentOptions) => {
      setPlans(d.plans ?? []);
      if (d.plans?.[0]) setForm(f => ({ ...f, plan_id: d.plans[0].id }));
      setPayOpts({ wompi_active: d.wompi_active, wompi_public_key: d.wompi_public_key, banks: d.banks ?? [], nequi_phone: d.nequi_phone, daviplata_phone: d.daviplata_phone });
      setPayMethod(d.wompi_active ? "card" : "transfer");
    });
  }, []);

  function handleCompanyName(name: string) {
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
    setForm(f => ({ ...f, company_name: name, slug }));
  }

  const selectedPlan = plans.find(p => p.id === form.plan_id);

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.admin_password !== form.admin_confirm) { setError("Las contraseñas no coinciden"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/public/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: form.company_name, slug: form.slug, email: form.email, phone: form.phone, nit: form.nit, plan_id: form.plan_id, admin_username: form.admin_username, admin_password: form.admin_password }),
    });
    const d = await res.json() as { ok?: boolean; error?: string; slug?: string; wompi?: WompiData; wompi_public_key?: string; company_id?: number; plan_name?: string; plan_amount?: number };
    if (d.ok) {
      setRegistered({ slug: d.slug!, wompi: d.wompi ?? null, wompi_public_key: d.wompi_public_key ?? null, company_id: d.company_id!, plan_name: d.plan_name ?? "", plan_amount: d.plan_amount ?? 0 });
      setStep(4);
    } else {
      setError(d.error ?? "Error al registrar");
    }
    setLoading(false);
  }

  async function handleProofSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!proofFile || !registered) return;
    setLoading(true); setError("");
    const fd = new FormData();
    fd.append("slug", registered.slug);
    fd.append("proof", proofFile);
    fd.append("amount", proofAmount);
    const res = await fetch("/api/public/payment/proof", { method: "POST", body: fd });
    const d = await res.json() as { ok?: boolean; error?: string };
    if (d.ok) { setProofSent(true); }
    else { setError(d.error ?? "Error al enviar comprobante"); }
    setLoading(false);
  }

  const s = { bg: "#0f172a", card: "#1e293b", border: "#334155", text: "#f1f5f9", muted: "#94a3b8", accent: "#0077b6" };

  // ── Paso 4: Pago ──────────────────────────────────────────────────────────
  if (step === 4 && registered) {
    // Transferencia — comprobante enviado
    if (proofSent) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: s.bg }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
            <div className="text-6xl mb-4">📬</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Comprobante recibido!</h2>
            <p className="text-gray-500 mb-4">Validaremos tu pago y te enviaremos las credenciales de acceso a <strong>{form.email}</strong> en las próximas horas.</p>
            <p className="text-sm text-gray-400">¿Preguntas? Escríbenos a <a href="mailto:hola@aivoxgroup.com" className="text-blue-500">hola@aivoxgroup.com</a></p>
          </div>
        </div>
      );
    }

    // Pago con tarjeta — mostrar botón Wompi o transferencia
    const useCard = payMethod === "card" && registered.wompi && registered.wompi_public_key;

    return (
      <div className="min-h-screen" style={{ background: s.bg }}>
        <div className="max-w-xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-xl mx-auto mb-4" style={{ background: s.accent }}>A</div>
            <h1 className="text-3xl font-bold text-white">Completa tu pago</h1>
            <p className="text-slate-400 mt-2">Empresa: <strong className="text-white">{form.company_name}</strong> · Plan: <strong className="text-white">{registered.plan_name}</strong></p>
          </div>

          <div style={{ background: s.card, border: `1px solid ${s.border}` }} className="rounded-2xl p-6 space-y-4">
            {/* Monto */}
            <div className="text-center py-4">
              <p className="text-slate-400 text-sm">Total a pagar</p>
              <p className="text-4xl font-black text-white">${registered.plan_amount.toLocaleString("es-CO")}</p>
              <p className="text-slate-400 text-sm">COP / mes</p>
            </div>

            {/* Selector de método si ambos disponibles */}
            {registered.wompi && (
              <div className="flex gap-2">
                <button onClick={() => setPayMethod("card")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${payMethod === "card" ? "text-white border-blue-500" : "text-slate-400 border-slate-600"}`} style={payMethod === "card" ? { background: s.accent } : {}}>
                  💳 Tarjeta
                </button>
                <button onClick={() => setPayMethod("transfer")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${payMethod === "transfer" ? "text-white border-blue-500" : "text-slate-400 border-slate-600"}`} style={payMethod === "transfer" ? { background: s.accent } : {}}>
                  🏦 Transferencia
                </button>
              </div>
            )}

            {/* PAGO CON TARJETA — Wompi */}
            {useCard && payMethod === "card" && (
              <div className="space-y-3">
                <p className="text-slate-300 text-sm text-center">Serás redirigido a la pasarela segura de Wompi para pagar con tarjeta de crédito o débito, PSE o Nequi.</p>
                <form action="https://checkout.wompi.co/p/" method="GET">
                  <input type="hidden" name="public-key"          value={registered.wompi_public_key!} />
                  <input type="hidden" name="currency"             value="COP" />
                  <input type="hidden" name="amount-in-cents"      value={String(registered.wompi!.amount_in_cents)} />
                  <input type="hidden" name="reference"            value={registered.wompi!.reference} />
                  <input type="hidden" name="redirect-url"         value={registered.wompi!.redirect_url} />
                  <input type="hidden" name="signature:integrity"  value={registered.wompi!.integrity} />
                  <input type="hidden" name="customer-data:email"  value={form.email} />
                  <button type="submit" className="w-full py-4 rounded-xl font-bold text-white text-base" style={{ background: "linear-gradient(135deg,#1e1b4b,#0077b6)" }}>
                    Pagar con Wompi →
                  </button>
                </form>
                <p className="text-xs text-slate-500 text-center">🔒 Pago 100% seguro — Procesado por Bancolombia / Wompi</p>
              </div>
            )}

            {/* TRANSFERENCIA BANCARIA */}
            {payMethod === "transfer" && (
              <form onSubmit={handleProofSubmit} className="space-y-4">
                <div>
                  <p className="text-slate-300 text-sm font-semibold mb-2">Realiza tu pago a:</p>
                  {payOpts.banks.map((b, i) => (
                    <div key={i} className="rounded-xl p-3 mb-2" style={{ background: "#0f172a", border: `1px solid ${s.border}` }}>
                      <p className="text-white text-sm font-semibold">🏦 {b.bank_name}</p>
                      <p className="text-slate-400 text-xs">{b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"}: {b.account_number}</p>
                      {b.account_holder && <p className="text-slate-400 text-xs">A nombre de: {b.account_holder}</p>}
                    </div>
                  ))}
                  {payOpts.nequi_phone && (
                    <div className="rounded-xl p-3 mb-2" style={{ background: "#0f172a", border: `1px solid ${s.border}` }}>
                      <p className="text-white text-sm font-semibold">📱 Nequi: {payOpts.nequi_phone}</p>
                    </div>
                  )}
                  {payOpts.daviplata_phone && (
                    <div className="rounded-xl p-3 mb-2" style={{ background: "#0f172a", border: `1px solid ${s.border}` }}>
                      <p className="text-white text-sm font-semibold">📱 Daviplata: {payOpts.daviplata_phone}</p>
                    </div>
                  )}
                  {payOpts.banks.length === 0 && !payOpts.nequi_phone && !payOpts.daviplata_phone && (
                    <p className="text-slate-400 text-sm">Contacta a <a href="mailto:hola@aivoxgroup.com" className="text-blue-400">hola@aivoxgroup.com</a> para obtener los datos de pago.</p>
                  )}
                </div>
                <div>
                  <label className="text-slate-300 text-sm block mb-1">Monto transferido (COP) *</label>
                  <input type="number" required value={proofAmount} onChange={e => setProofAmount(e.target.value)} placeholder={String(registered.plan_amount)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{ background: "#0f172a", border: `1px solid ${s.border}`, color: s.text }} />
                </div>
                <div>
                  <label className="text-slate-300 text-sm block mb-1">Comprobante de pago *</label>
                  <input type="file" required accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={e => setProofFile(e.target.files?.[0] ?? null)}
                    className="w-full text-slate-400 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:text-white file:cursor-pointer"
                    style={{ background: "#0f172a", border: `1px solid ${s.border}`, borderRadius: "12px", padding: "8px" }} />
                  <p className="text-xs text-slate-500 mt-1">JPG, PNG, WebP o PDF — máximo 10 MB</p>
                </div>
                {error && <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-xl">{error}</p>}
                <button type="submit" disabled={loading || !proofFile} className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#1e1b4b,#0077b6)" }}>
                  {loading ? "Enviando..." : "Enviar comprobante →"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Pasos 1-3: Datos y plan ───────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: s.bg }}>
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-xl mx-auto mb-4" style={{ background: s.accent }}>A</div>
          <h1 className="text-3xl font-bold text-white">Crear cuenta en Aivox</h1>
          <p className="text-slate-400 mt-2">Tu plataforma de ventas y atención al cliente con IA</p>
        </div>

        {/* Progreso */}
        <div className="flex items-center gap-2 mb-8">
          {[1,2,3].map(n => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${step >= n ? "text-white" : "text-slate-400"}`}
                style={{ background: step >= n ? s.accent : "#334155" }}>
                {step > n ? "✓" : n}
              </div>
              <span className={`text-xs ${step >= n ? "text-white" : "text-slate-500"}`}>
                {n === 1 ? "Empresa" : n === 2 ? "Plan" : "Acceso"}
              </span>
              {n < 3 && <div className={`flex-1 h-0.5 rounded ${step > n ? "" : ""}`} style={{ background: step > n ? s.accent : "#334155" }} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleRegisterSubmit}>
          <div className="rounded-2xl p-6 space-y-4" style={{ background: s.card, border: `1px solid ${s.border}` }}>

            {/* Paso 1 — Empresa */}
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
                    <label className="text-slate-300 text-sm block mb-1">{f.label}</label>
                    <input type={f.type ?? "text"} value={form[f.key as keyof typeof form] as string}
                      placeholder={f.placeholder} required={f.label.includes("*")}
                      onChange={e => f.onChange ? f.onChange(e.target.value) : setForm({...form, [f.key]: e.target.value})}
                      className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                      style={{ background: "#0f172a", border: `1px solid ${s.border}`, color: s.text }} />
                  </div>
                ))}
                <div>
                  <label className="text-slate-300 text-sm block mb-1">Identificador único *</label>
                  <div className="flex items-center rounded-xl overflow-hidden" style={{ background: "#0f172a", border: `1px solid ${s.border}` }}>
                    <span className="px-3 text-slate-500 text-sm border-r py-2.5 shrink-0" style={{ borderColor: s.border }}>aivoxgroup.com/</span>
                    <input value={form.slug} onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"")})}
                      placeholder="mi-empresa" required className="flex-1 bg-transparent px-3 py-2.5 text-white text-sm focus:outline-none" />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Solo letras minúsculas, números y guiones.</p>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="button" onClick={() => { if (!form.company_name || !form.email || !form.slug) { setError("Completa los campos requeridos"); return; } setError(""); setStep(2); }}
                  className="w-full text-white py-3 rounded-xl font-semibold" style={{ background: s.accent }}>
                  Siguiente →
                </button>
              </>
            )}

            {/* Paso 2 — Plan */}
            {step === 2 && (
              <>
                <h2 className="text-white font-semibold text-lg">Elige tu plan</h2>
                <div className="space-y-3">
                  {plans.map(p => (
                    <label key={p.id} className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-colors" style={{ border: `2px solid ${form.plan_id === p.id ? s.accent : s.border}`, background: form.plan_id === p.id ? "rgba(0,119,182,.15)" : "transparent" }}>
                      <input type="radio" name="plan" value={p.id} checked={form.plan_id === p.id} onChange={() => setForm({...form, plan_id: p.id})} className="accent-blue-500" />
                      <div className="flex-1">
                        <p className="text-white font-semibold">{p.name}</p>
                        {p.description && <p className="text-slate-400 text-xs mt-0.5">{p.description}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-bold">${p.price_monthly.toLocaleString("es-CO")}</p>
                        <p className="text-slate-400 text-xs">/ mes</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl text-sm font-semibold text-slate-300" style={{ border: `1px solid ${s.border}` }}>← Atrás</button>
                  <button type="button" onClick={() => { setError(""); setStep(3); }} className="flex-1 py-3 rounded-xl font-semibold text-white" style={{ background: s.accent }}>Siguiente →</button>
                </div>
              </>
            )}

            {/* Paso 3 — Acceso */}
            {step === 3 && (
              <>
                <h2 className="text-white font-semibold text-lg">Crea tu usuario administrador</h2>
                {[
                  { label: "Usuario *", key: "admin_username", placeholder: "admin" },
                  { label: "Contraseña *", key: "admin_password", type: "password", placeholder: "Mínimo 6 caracteres" },
                  { label: "Confirmar contraseña *", key: "admin_confirm", type: "password", placeholder: "Repite la contraseña" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-slate-300 text-sm block mb-1">{f.label}</label>
                    <input type={f.type ?? "text"} value={form[f.key as keyof typeof form] as string}
                      placeholder={f.placeholder} required minLength={f.key.includes("password") || f.key === "admin_confirm" ? 6 : 1}
                      onChange={e => setForm({...form, [f.key]: e.target.value})}
                      className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                      style={{ background: "#0f172a", border: `1px solid ${s.border}`, color: s.text }} />
                  </div>
                ))}
                <div className="rounded-xl p-3 text-sm text-slate-400" style={{ background: "#0f172a", border: `1px solid ${s.border}` }}>
                  <p>📋 <strong className="text-white">Resumen:</strong> {form.company_name} · Plan {selectedPlan?.name} · ${selectedPlan?.price_monthly.toLocaleString("es-CO")} COP/mes</p>
                </div>
                {error && <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-xl">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl text-sm font-semibold text-slate-300" style={{ border: `1px solid ${s.border}` }}>← Atrás</button>
                  <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-50" style={{ background: s.accent }}>
                    {loading ? "Registrando..." : "Continuar al pago 💳"}
                  </button>
                </div>
              </>
            )}
          </div>
        </form>

        <p className="text-center text-slate-500 text-sm mt-6">
          ¿Ya tienes cuenta? <a href="/login" className="text-blue-400 hover:text-blue-300">Inicia sesión</a>
        </p>
      </div>
    </div>
  );
}
