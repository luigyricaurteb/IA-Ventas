"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? "Error al iniciar sesión");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Agente DMC</h1>
          <p className="text-gray-400 mt-2">Sistema de gestión de ventas</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="admin"
              required
              autoFocus
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Contraseña</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
              className="w-full border rounded-xl px-4 py-3 mt-1 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
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
            {loading ? "Iniciando sesión..." : "Ingresar"}
          </button>
          <p className="text-center text-xs text-gray-400 pt-2">
            Credenciales por defecto: <strong>admin</strong> / <strong>admin123</strong>
          </p>
        </form>
      </div>
    </div>
  );
}
