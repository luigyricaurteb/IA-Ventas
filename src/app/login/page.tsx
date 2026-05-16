"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CompanyOption { slug: string; name: string; status: string }

export default function LoginPage() {
  const router = useRouter();
  const [companies, setCompanies]       = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelected]  = useState<string>("__master__");
  const [form, setForm]                 = useState({ username: "", password: "" });
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    fetch("/api/public/companies")
      .then(r => r.json())
      .then(d => setCompanies(d.companies || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");

    const endpoint = selectedCompany === "__master__"
      ? "/api/auth/login"
      : "/api/auth/login";

    const res = await fetch(endpoint, {
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
      router.push("/");
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? "Credenciales incorrectas");
    }
    setLoading(false);
  }

  const activeCompanies = companies.filter(c => c.status === "active");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">🤖</div>
          <h1 className="text-3xl font-bold text-white">Agente DMC</h1>
          <p className="text-gray-400 mt-1 text-sm">Plataforma de ventas autónoma</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Empresa</label>
            <select
              value={selectedCompany}
              onChange={e => setSelected(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500 bg-white"
            >
              <option value="__master__">🏢 Administración de Plataforma</option>
              {activeCompanies.length > 0 && <option disabled>──────────────</option>}
              {activeCompanies.map(c => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder={selectedCompany === "__master__" ? "master" : "usuario"}
              required autoFocus
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Contraseña</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.username || !form.password}
            className="w-full bg-emerald-500 text-white rounded-xl py-3 font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
