"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";

const BUILD = "v3.0 · " + new Date("2026-05-24").toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric" });

interface CompanyOption { slug: string; name: string; status: string; logo_filename?: string | null }

export default function LoginPage() {
  const router = useRouter();
  const [companies, setCompanies]      = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelected] = useState<string>("__master__");
  const [form, setForm]                = useState({ username: "", password: "" });
  const [error, setError]              = useState("");
  const [loading, setLoading]          = useState(false);
  const [showForgot, setShowForgot]    = useState(false);

  useEffect(() => {
    fetch("/api/public/companies")
      .then(r => r.json())
      .then((d: { companies: CompanyOption[] }) => setCompanies(d.companies || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username,
        password: form.password,
        company:  selectedCompany === "__master__" ? undefined : selectedCompany,
        isMaster: selectedCompany === "__master__",
      }),
    });

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Credenciales incorrectas");
    }
    setLoading(false);
  }

  const activeCompanies = companies.filter(c => c.status === "active");
  const selectedInfo = activeCompanies.find(c => c.slug === selectedCompany);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #fdf8f2 0%, #f0e4d0 50%, #e8d5bb 100%)" }}>
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          {selectedInfo?.logo_filename ? (
            <img src={`/uploads/master/${selectedInfo.logo_filename}`} alt={selectedInfo.name}
              className="w-16 h-16 object-contain rounded-2xl mx-auto mb-4 p-1" style={{ background: "var(--surface)" }} />
          ) : (
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg text-white text-2xl font-black" style={{ background: "var(--accent)" }}>
              H
            </div>
          )}
          <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            {selectedInfo ? selectedInfo.name : "Aivox"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {selectedCompany === "__master__" ? "Administración de Plataforma" : "Plataforma de ventas inteligente"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl shadow-xl p-8 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {/* Selector de empresa */}
          <div>
            <label className="text-sm font-medium text-gray-700">Empresa</label>
            <select
              value={selectedCompany}
              onChange={e => { setSelected(e.target.value); setError(""); }}
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500 bg-white"
            >
              <option value="__master__">🏛️ Administración de Plataforma</option>
              {activeCompanies.length > 0 && (
                <option disabled>──── Empresas ────</option>
              )}
              {activeCompanies.map(c => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Usuario */}
          <div>
            <label className="text-sm font-medium text-gray-700">Usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder={selectedCompany === "__master__" ? "master" : "usuario"}
              required autoFocus autoComplete="username"
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="text-sm font-medium text-gray-700">Contraseña</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required autoComplete="current-password"
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2">
              <span>⚠️</span><span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.username || !form.password}
            className="w-full bg-emerald-500 text-white rounded-xl py-3 font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors text-sm"
          >
            {loading ? "Verificando..." : "Ingresar →"}
          </button>

          <div className="text-center">
            <button type="button" onClick={() => setShowForgot(true)}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
              ¿Olvidaste tu usuario o contraseña?
            </button>
          </div>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: "var(--text-muted)" }}>
          ¿No tienes cuenta? <a href="/register" className="font-medium" style={{ color: "var(--accent)" }}>Regístrate gratis</a>
        </p>
        <p className="text-center text-gray-600 text-xs mt-2">{BUILD}</p>
      </div>

      {showForgot && (
        <ForgotPasswordModal
          selectedCompany={selectedCompany}
          activeCompanies={activeCompanies}
          onClose={() => setShowForgot(false)}
        />
      )}
    </div>
  );
}
