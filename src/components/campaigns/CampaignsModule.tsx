"use client";

import { useState, useEffect } from "react";

interface Campaign {
  id: number; name: string; subject: string; body_html: string;
  target_stage: string | null; status: string;
  recipients_count: number; sent_at: number | null; created_at: number;
}

const STAGES = [
  { value: "", label: "Todos los contactos con email" },
  { value: "NUEVO", label: "Nuevos" },
  { value: "CALIFICADO", label: "Calificados" },
  { value: "PROPUESTA", label: "Propuesta enviada" },
  { value: "NEGOCIACION", label: "En negociación" },
  { value: "GANADO", label: "Ganados" },
  { value: "PERDIDO", label: "Perdidos" },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sending: "bg-blue-100 text-blue-600",
  sent: "bg-emerald-100 text-emerald-600",
  failed: "bg-red-100 text-red-600",
};

export default function CampaignsModule() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", subject: "", body_html: "", target_stage: "" });

  async function fetch_() {
    const res = await fetch("/api/campaigns");
    if (res.ok) setCampaigns((await res.json()).campaigns);
  }
  useEffect(() => { fetch_(); const i = setInterval(fetch_, 5000); return () => clearInterval(i); }, []);

  async function create() {
    if (!form.name || !form.subject || !form.body_html) return;
    await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, target_stage: form.target_stage || null }),
    });
    setShowForm(false);
    setForm({ name: "", subject: "", body_html: "", target_stage: "" });
    fetch_();
  }

  async function send(id: number) {
    if (!confirm("¿Enviar esta campaña ahora? Esta acción no se puede deshacer.")) return;
    setSending(id);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    const data = await res.json();
    setSending(null);
    if (data.ok) alert(`✅ Enviado a ${data.sent} contactos. ${data.failed} fallidos.`);
    else alert(`Error: ${data.error}`);
    fetch_();
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Email Marketing</h1>
          <p className="text-sm text-gray-400">Campañas segmentadas por etapa del CRM</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
          + Nueva campaña
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        💡 Las campañas se envían por <strong>email</strong>, nunca por WhatsApp masivo. Esto protege tu número de bloqueos de Meta.
      </div>

      <div className="space-y-3">
        {campaigns.length === 0 && (
          <div className="text-center text-gray-400 py-12">Aún no hay campañas. Crea la primera.</div>
        )}
        {campaigns.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{c.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] ?? ""}`}>
                  {c.status}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-0.5">Asunto: {c.subject}</p>
              <p className="text-xs text-gray-300 mt-0.5">
                Segmento: {STAGES.find((s) => s.value === (c.target_stage ?? ""))?.label ?? c.target_stage}
                {c.status === "sent" && ` · Enviado a ${c.recipients_count} contactos`}
                {c.sent_at && ` · ${new Date(c.sent_at * 1000).toLocaleDateString("es")}`}
              </p>
            </div>
            {c.status === "draft" && (
              <button
                onClick={() => send(c.id)}
                disabled={sending === c.id}
                className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 shrink-0"
              >
                {sending === c.id ? "Enviando..." : "Enviar"}
              </button>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between">
              <h2 className="font-bold text-gray-800">Nueva campaña</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Nombre de la campaña *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Promoción Semana Santa" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Segmento destino</label>
                <select value={form.target_stage} onChange={(e) => setForm({ ...form, target_stage: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                  {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Asunto del email *</label>
                <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Ej: ¡Oferta especial para ti, {{nombre}}!" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Contenido del email *</label>
                <p className="text-xs text-gray-400 mb-1">Variables disponibles: {`{{nombre}}`}, {`{{empresa}}`}</p>
                <textarea value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                  rows={8} placeholder="<h1>Hola {{nombre}}</h1><p>Tenemos una oferta especial...</p>"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={create} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600">
                  Crear campaña (borrador)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
