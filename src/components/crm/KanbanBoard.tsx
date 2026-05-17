"use client";

import { useState, useEffect } from "react";
import type { CrmDealWithDetails, CrmStage } from "@/lib/db";

const STAGES: { id: CrmStage; label: string; color: string }[] = [
  { id: "NUEVO",       label: "Nuevo",        color: "bg-gray-100 border-gray-300" },
  { id: "CALIFICADO",  label: "Calificado",   color: "bg-blue-50 border-blue-200" },
  { id: "PROPUESTA",   label: "Propuesta",    color: "bg-yellow-50 border-yellow-200" },
  { id: "NEGOCIACION", label: "Negociación",  color: "bg-orange-50 border-orange-200" },
  { id: "GANADO",      label: "Ganado ✓",     color: "bg-emerald-50 border-emerald-200" },
  { id: "PERDIDO",     label: "Perdido",      color: "bg-red-50 border-red-200" },
];

function timeInStage(changedAt: number): string {
  const diff = Math.floor(Date.now() / 1000) - changedAt;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface DealModalProps {
  deal: CrmDealWithDetails;
  onClose: () => void;
  onStageChange: () => void;
}

function DealModal({ deal, onClose, onStageChange }: DealModalProps) {
  const [activities, setActivities] = useState<{ id: number; type: string; description: string; created_at: number }[]>([]);
  const [note, setNote] = useState("");
  const [selectedStage, setSelectedStage] = useState<CrmStage>(deal.stage);

  useEffect(() => {
    fetch(`/api/crm/deals/${deal.id}`)
      .then((r) => r.json())
      .then((d) => setActivities(d.activities ?? []));
  }, [deal.id]);

  async function saveStage() {
    await fetch(`/api/crm/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: selectedStage }),
    });
    onStageChange();
    onClose();
  }

  async function addNote() {
    if (!note.trim()) return;
    await fetch(`/api/crm/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() }),
    });
    setNote("");
    const d = await fetch(`/api/crm/deals/${deal.id}`).then((r) => r.json());
    setActivities(d.activities ?? []);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-bold text-gray-800 text-lg">{deal.contact_name ?? deal.contact_phone ?? "Sin nombre"}</h2>
              <p className="text-sm text-gray-400">{deal.contact_email ?? ""}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {deal.product_name && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <span className="text-gray-500">Producto:</span> <strong>{deal.product_name}</strong>
              {deal.total_value && <span className="ml-2 text-emerald-600 font-semibold">${deal.total_value.toLocaleString("es-CO")}</span>}
              {deal.people_count && <span className="ml-2 text-gray-400">· {deal.people_count} personas</span>}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Mover a etapa</label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value as CrmStage)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button
              onClick={saveStage}
              className="mt-2 w-full bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600"
            >
              Guardar cambio de etapa
            </button>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Agregar nota</label>
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNote()}
                placeholder="Escribir nota..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={addNote} className="bg-gray-800 text-white px-3 rounded-lg text-sm">+</button>
            </div>
          </div>

          {activities.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Historial</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activities.map((a) => (
                  <div key={a.id} className="text-xs bg-gray-50 rounded p-2">
                    <span className={`font-medium ${a.type === "stage_change" ? "text-blue-600" : "text-gray-600"}`}>
                      {a.type === "stage_change" ? "📍" : "📝"} {a.description}
                    </span>
                    <span className="text-gray-300 ml-2">
                      {new Date(a.created_at * 1000).toLocaleDateString("es")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KanbanBoard() {
  const [deals, setDeals] = useState<CrmDealWithDetails[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<CrmDealWithDetails | null>(null);

  async function fetchDeals() {
    const res = await fetch("/api/crm/deals");
    if (res.ok) {
      const data = await res.json();
      setDeals(data.deals);
    }
  }

  useEffect(() => {
    fetchDeals();
    const interval = setInterval(fetchDeals, 2000);
    return () => clearInterval(interval);
  }, []);

  const byStage = (stage: CrmStage) => deals.filter((d) => d.stage === stage);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-4 md:px-6 py-3 border-b bg-white">
        <h1 className="text-lg md:text-xl font-bold text-gray-800">CRM — Pipeline</h1>
        <p className="text-xs md:text-sm text-gray-400">{deals.length} negocios</p>
      </div>
      <div className="flex-1 overflow-x-auto p-2 md:p-4">
        <div className="flex gap-2 md:gap-3 h-full" style={{ minWidth: `${STAGES.length * 180}px` }}>
          {STAGES.map((stage) => {
            const stageDeals = byStage(stage.id);
            return (
              <div key={stage.id} className={`flex flex-col rounded-xl border-2 ${stage.color} flex-1 min-w-[200px]`}>
                <div className="px-3 py-2 border-b border-current/10">
                  <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                  <span className="ml-2 text-xs bg-white/60 rounded-full px-2 py-0.5 text-gray-500">{stageDeals.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      onClick={() => setSelectedDeal(deal)}
                      className="bg-white rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow border border-gray-100"
                    >
                      <p className="font-medium text-gray-800 text-sm truncate">
                        {deal.contact_name ?? deal.contact_phone ?? "Sin nombre"}
                      </p>
                      {deal.product_name && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{deal.product_name}</p>
                      )}
                      {deal.total_value && (
                        <p className="text-xs text-emerald-600 font-semibold mt-1">
                          ${deal.total_value.toLocaleString("es-CO")}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-300">{timeInStage(deal.stage_changed_at)} en esta etapa</span>
                        <span className="text-xs text-gray-300">{deal.contact_phone}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedDeal && (
        <DealModal
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onStageChange={fetchDeals}
        />
      )}
    </div>
  );
}
