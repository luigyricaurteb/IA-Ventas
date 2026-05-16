"use client";

import { useState, useEffect } from "react";

interface FlowStep {
  id: string;
  trigger: string;
  triggerType: "keyword" | "stage" | "always";
  action: "reply" | "move_stage" | "assign_tag" | "send_template";
  actionValue: string;
  nextStepId?: string;
}

interface Flow {
  id: number;
  name: string;
  active: number;
  steps: FlowStep[];
}

const STAGE_OPTIONS = ["NUEVO", "CALIFICADO", "PROPUESTA", "NEGOCIACION", "GANADO", "PERDIDO"];
const ACTION_LABELS: Record<string, string> = {
  reply: "Responder con texto",
  move_stage: "Mover etapa CRM",
  assign_tag: "Asignar etiqueta",
  send_template: "Enviar plantilla",
};

function uid() { return Math.random().toString(36).slice(2, 8); }

export default function FlowBuilder() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [editing, setEditing] = useState<Flow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch("/api/flows").then(r => r.json()).then(d => setFlows(d.flows ?? []));
  }, []);

  async function saveFlow(flow: Flow) {
    const res = await fetch(flow.id ? `/api/flows/${flow.id}` : "/api/flows", {
      method: flow.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flow),
    });
    const d = await res.json() as { flow: Flow };
    if (flow.id) {
      setFlows(prev => prev.map(f => f.id === flow.id ? d.flow : f));
    } else {
      setFlows(prev => [...prev, d.flow]);
    }
    setEditing(null);
  }

  async function deleteFlow(id: number) {
    if (!confirm("¿Eliminar este flujo?")) return;
    await fetch(`/api/flows/${id}`, { method: "DELETE" });
    setFlows(prev => prev.filter(f => f.id !== id));
  }

  async function toggleActive(flow: Flow) {
    const updated = { ...flow, active: flow.active ? 0 : 1 };
    await saveFlow(updated);
    setFlows(prev => prev.map(f => f.id === flow.id ? updated : f));
  }

  function createNew() {
    if (!newName.trim()) return;
    setEditing({ id: 0, name: newName.trim(), active: 1, steps: [] });
    setShowNew(false);
    setNewName("");
  }

  function addStep(flow: Flow): Flow {
    const step: FlowStep = {
      id: uid(), trigger: "", triggerType: "keyword",
      action: "reply", actionValue: "",
    };
    return { ...flow, steps: [...flow.steps, step] };
  }

  function updateStep(flow: Flow, stepId: string, changes: Partial<FlowStep>): Flow {
    return { ...flow, steps: flow.steps.map(s => s.id === stepId ? { ...s, ...changes } : s) };
  }

  function removeStep(flow: Flow, stepId: string): Flow {
    return { ...flow, steps: flow.steps.filter(s => s.id !== stepId) };
  }

  if (editing) {
    return (
      <div className="flex-1 overflow-auto p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">← Volver</button>
          <h2 className="text-lg font-bold text-gray-800">{editing.name}</h2>
        </div>

        <div className="space-y-3 mb-4">
          {editing.steps.map((step, i) => (
            <div key={step.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase">Paso {i + 1}</span>
                <button onClick={() => setEditing(removeStep(editing, step.id))} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Condición</label>
                  <select value={step.triggerType} onChange={e => setEditing(updateStep(editing, step.id, { triggerType: e.target.value as FlowStep["triggerType"] }))}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    <option value="keyword">Contiene palabra clave</option>
                    <option value="stage">Cliente en etapa CRM</option>
                    <option value="always">Siempre (primer mensaje)</option>
                  </select>
                </div>
                {step.triggerType !== "always" && (
                  <div>
                    <label className="text-xs text-gray-500">
                      {step.triggerType === "keyword" ? "Palabra clave" : "Etapa"}
                    </label>
                    {step.triggerType === "keyword" ? (
                      <input value={step.trigger} onChange={e => setEditing(updateStep(editing, step.id, { trigger: e.target.value }))}
                        placeholder="Ej: precio, reserva, info" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                    ) : (
                      <select value={step.trigger} onChange={e => setEditing(updateStep(editing, step.id, { trigger: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                        <option value="">Seleccionar...</option>
                        {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500">Acción</label>
                  <select value={step.action} onChange={e => setEditing(updateStep(editing, step.id, { action: e.target.value as FlowStep["action"] }))}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Valor de la acción</label>
                  {step.action === "move_stage" ? (
                    <select value={step.actionValue} onChange={e => setEditing(updateStep(editing, step.id, { actionValue: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                      <option value="">Seleccionar etapa...</option>
                      {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input value={step.actionValue} onChange={e => setEditing(updateStep(editing, step.id, { actionValue: e.target.value }))}
                      placeholder={step.action === "reply" ? "Texto de respuesta..." : step.action === "assign_tag" ? "nombre-etiqueta" : "nombre-plantilla"}
                      className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={() => setEditing(addStep(editing))}
            className="flex-1 py-2 border-2 border-dashed border-gray-200 text-gray-400 hover:border-emerald-400 hover:text-emerald-500 rounded-xl text-sm transition-colors">
            + Agregar paso
          </button>
          <button onClick={() => saveFlow(editing)}
            className="px-6 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600">
            Guardar flujo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Constructor de Flujos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Automatiza respuestas según palabras clave o etapas del CRM</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-600">
          + Nuevo flujo
        </button>
      </div>

      {showNew && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Nombre del flujo</p>
          <div className="flex gap-2">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createNew()}
              placeholder="Ej: Flujo de bienvenida, Consulta de precios..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={createNew} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm">Crear</button>
            <button onClick={() => setShowNew(false)} className="text-gray-400 px-2">✕</button>
          </div>
        </div>
      )}

      {flows.length === 0 && !showNew && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔀</p>
          <p className="font-medium">Sin flujos configurados</p>
          <p className="text-sm mt-1">Crea tu primer flujo para automatizar respuestas</p>
        </div>
      )}

      <div className="space-y-3">
        {flows.map(flow => (
          <div key={flow.id} className="bg-white border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleActive(flow)}
                  className={`w-10 h-6 rounded-full transition-colors ${flow.active ? "bg-emerald-500" : "bg-gray-300"}`}>
                  <span className={`block w-4 h-4 rounded-full bg-white shadow ml-1 transition-transform ${flow.active ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <div>
                  <p className="font-medium text-gray-800">{flow.name}</p>
                  <p className="text-xs text-gray-400">{flow.steps.length} paso{flow.steps.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(flow)} className="text-sm text-blue-500 hover:text-blue-700">Editar</button>
                <button onClick={() => deleteFlow(flow.id)} className="text-sm text-red-400 hover:text-red-600">Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
