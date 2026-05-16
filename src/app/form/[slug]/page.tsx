"use client";

import { useState } from "react";
import { use } from "react";

export default function LeadFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [form, setForm] = useState({ name: "", phone: "", email: "", interest: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/public/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, slug }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setStatus("done");
        setMsg(data.message ?? "¡Formulario enviado correctamente!");
      } else {
        setStatus("error");
        setMsg(data.error ?? "Error al enviar. Inténtalo de nuevo.");
      }
    } catch {
      setStatus("error");
      setMsg("Error de conexión. Verifica tu internet.");
    }
  }

  if (status === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">¡Listo!</h2>
          <p className="text-gray-600 text-sm">{msg}</p>
          <p className="text-xs text-gray-400 mt-4">Revisa tu WhatsApp, te contactaremos pronto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xl">💬</div>
          <div>
            <h1 className="font-bold text-gray-800 text-lg">Contáctanos</h1>
            <p className="text-xs text-gray-400">Te responderemos por WhatsApp</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Nombre completo *</label>
            <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              placeholder="Juan Pérez" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:border-emerald-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Celular WhatsApp *</label>
            <input required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              placeholder="3001234567" type="tel" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:border-emerald-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Correo electrónico</label>
            <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
              placeholder="juan@email.com" type="email" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:border-emerald-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">¿Qué te interesa?</label>
            <input value={form.interest} onChange={e => setForm({...form, interest: e.target.value})}
              placeholder="Paquete a Cartagena, reserva de hotel, etc." className="w-full border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:border-emerald-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Mensaje</label>
            <textarea value={form.message} onChange={e => setForm({...form, message: e.target.value})}
              rows={3} placeholder="Cuéntanos más detalles..." className="w-full border rounded-lg px-3 py-2 mt-1 text-sm outline-none focus:border-emerald-400 resize-none" />
          </div>
          {status === "error" && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{msg}</p>}
          <button type="submit" disabled={status === "sending"}
            className="w-full bg-emerald-500 text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors">
            {status === "sending" ? "Enviando..." : "Enviar por WhatsApp 💬"}
          </button>
        </form>
        <p className="text-xs text-gray-400 text-center mt-4">
          Al enviar autorizas el tratamiento de tus datos personales.
        </p>
      </div>
    </div>
  );
}
