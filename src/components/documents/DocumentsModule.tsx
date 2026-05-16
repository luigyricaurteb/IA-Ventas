"use client";

import { useState, useEffect } from "react";

interface LegalDocument { id: number; type: string; title: string; content: string; version: string; active: number; created_at: number }

const DATA_TREATMENT_DEFAULT = `POLÍTICA DE TRATAMIENTO DE DATOS PERSONALES

En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013, [NOMBRE EMPRESA] informa:

1. RESPONSABLE DEL TRATAMIENTO: [NOMBRE EMPRESA], [DIRECCIÓN], [CIUDAD].

2. DATOS RECOPILADOS: nombre completo, número de teléfono, correo electrónico, información de viaje o evento.

3. FINALIDAD: Atención de solicitudes, envío de cotizaciones, comunicación comercial y prestación del servicio contratado.

4. DERECHOS DEL TITULAR: Conocer, actualizar, rectificar y suprimir sus datos. Revocar la autorización en cualquier momento.

5. CONTACTO: Para ejercer sus derechos escriba a [EMAIL EMPRESA].

Al responder SI, usted autoriza el tratamiento de sus datos para las finalidades descritas.`;

export default function DocumentsModule() {
  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [editing, setEditing] = useState<LegalDocument | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "data_treatment", title: "Política de Tratamiento de Datos", content: DATA_TREATMENT_DEFAULT, version: "1.0", active: true });

  async function fetch_() {
    const res = await fetch("/api/documents");
    if (res.ok) setDocs((await res.json()).documents);
  }
  useEffect(() => { fetch_(); }, []);

  function openNew() { setEditing(null); setForm({ type: "data_treatment", title: "Política de Tratamiento de Datos", content: DATA_TREATMENT_DEFAULT, version: "1.0", active: true }); setShowForm(true); }
  function openEdit(d: LegalDocument) { setEditing(d); setForm({ type: d.type, title: d.title, content: d.content, version: d.version, active: d.active === 1 }); setShowForm(true); }

  async function save() {
    if (editing) {
      await fetch(`/api/documents/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, active: form.active ? 1 : 0 }) });
    } else {
      await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, active: form.active ? 1 : 0 }) });
    }
    setShowForm(false);
    fetch_();
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Documentos Legales</h1>
          <p className="text-sm text-gray-400">El bot envía el documento activo al iniciar cada conversación</p>
        </div>
        <button onClick={openNew} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">+ Nuevo documento</button>
      </div>

      <div className="space-y-3">
        {docs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-3">No hay documentos. Crea la política de tratamiento de datos para que el bot la envíe al inicio de cada conversación.</p>
            <button onClick={openNew} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Crear política de datos</button>
          </div>
        )}
        {docs.map((d) => (
          <div key={d.id} className={`bg-white border rounded-xl p-4 ${!d.active ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{d.title}</span>
                  {d.active === 1 && <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">Activo</span>}
                  <span className="text-xs text-gray-400">v{d.version}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{d.type} · {new Date(d.created_at * 1000).toLocaleDateString("es")}</p>
              </div>
              <button onClick={() => openEdit(d)} className="text-sm text-blue-500 hover:text-blue-700">Editar</button>
            </div>
            <p className="text-sm text-gray-500 mt-2 line-clamp-2">{d.content.slice(0, 120)}...</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between">
              <h2 className="font-bold text-gray-800">{editing ? "Editar documento" : "Nuevo documento"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">Título</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Versión</label>
                  <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} id="docActive" />
                  <label htmlFor="docActive" className="text-sm text-gray-700">Activo (bot lo usa)</label>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Contenido del documento</label>
                <p className="text-xs text-gray-400 mb-1">El bot enviará las primeras 400 caracteres + "..." al cliente por WhatsApp.</p>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={14} className="w-full border rounded-lg px-3 py-2 text-sm font-mono resize-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={save} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600">
                  {editing ? "Guardar cambios" : "Crear documento"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
