"use client";
import { useState } from "react";

interface Company { slug: string; name: string; status: string }

export default function ForgotPasswordModal({
  selectedCompany, activeCompanies, onClose
}: {
  selectedCompany: string;
  activeCompanies: Company[];
  onClose: () => void;
}) {
  const [company, setCompany] = useState(selectedCompany);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError("Ingresa tu usuario"); return; }
    setLoading(true); setError("");
    await fetch("/api/auth/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), company: company === "__master__" ? undefined : company }),
    });
    setDone(true);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-800">Recuperar acceso</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">📧</div>
            <h3 className="font-semibold text-gray-800 mb-2">Revisa tu correo</h3>
            <p className="text-sm text-gray-500">Si el usuario existe, recibirás un enlace para restablecer tu contraseña en el correo registrado de la empresa.</p>
            <p className="text-xs text-gray-400 mt-2">El enlace expira en 1 hora.</p>
            <button onClick={onClose} className="mt-4 text-sm text-blue-600 underline">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-500">Ingresa tu usuario y te enviaremos un enlace de recuperación al correo registrado.</p>

            <div>
              <label className="text-sm font-medium text-gray-700">Empresa</label>
              <select value={company} onChange={e => setCompany(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 mt-1 text-sm">
                <option value="__master__">🏛️ Administración de Plataforma</option>
                {activeCompanies.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Usuario</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Tu nombre de usuario" required autoFocus
                className="w-full border rounded-lg px-3 py-2.5 mt-1 text-sm" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: "#0077b6" }}>
                {loading ? "Enviando..." : "Enviar enlace"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
