"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token   = params.get("token") ?? "";
  const company = params.get("company") ?? "";

  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    if (password.length < 6) { setError("Mínimo 6 caracteres"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const d = await res.json() as { ok?: boolean; error?: string };
    if (d.ok) { setDone(true); setTimeout(() => router.push("/login"), 2500); }
    else setError(d.error ?? "Error al restablecer");
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f172a" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-sm" style={{ background: "#0077b6" }}>H</div>
          <span className="font-bold text-lg text-gray-800">Hivo</span>
        </div>
        {done ? (
          <div className="text-center">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="font-bold text-gray-800 mb-1">Contraseña actualizada</h2>
            <p className="text-sm text-gray-500">Redirigiendo al login...</p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-1">Nueva contraseña</h2>
            <p className="text-sm text-gray-500 mb-6">Elige una contraseña segura de al menos 6 caracteres</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Nueva contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required minLength={6}
                  className="w-full border rounded-lg px-3 py-2.5 mt-1 text-sm focus:border-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Confirmar contraseña</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required minLength={6}
                  className="w-full border rounded-lg px-3 py-2.5 mt-1 text-sm focus:border-blue-500" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: "#0077b6" }}>
                {loading ? "Actualizando..." : "Restablecer contraseña"}
              </button>
            </form>
          </>
        )}
        <p className="text-center mt-4">
          <a href="/login" className="text-xs text-gray-400 hover:text-gray-600">← Volver al login</a>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>;
}
