"use client";
import { useState, useEffect, useRef } from "react";
import { playNotification } from "@/lib/notification-sound";

interface JulietaAlert {
  id: number; conversation_id: number; question: string;
  julieta_response: string | null; phone: string | null;
  contact_name: string | null; created_at: number;
}

interface JulietaAlertsPanelProps {
  onAlertCountChange?: (count: number) => void;
}

export default function JulietaAlertsPanel({ onAlertCountChange }: JulietaAlertsPanelProps) {
  const [alerts, setAlerts] = useState<JulietaAlert[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, { answer: string; topic: string; sendToClient: boolean; save: boolean }>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);
  const prevCountRef = useRef<number>(0);

  async function fetch_() {
    const res = await fetch("/api/julieta/alerts");
    if (res.ok) {
      const d = await res.json();
      const newAlerts = d.alerts ?? [];
      const newCount = d.count ?? 0;
      if (prevCountRef.current > 0 && newCount > prevCountRef.current) {
        playNotification("bell");
      }
      prevCountRef.current = newCount;
      setAlerts(newAlerts);
      onAlertCountChange?.(newCount);
    }
  }

  useEffect(() => { fetch_(); const i = setInterval(fetch_, 5000); return () => clearInterval(i); }, []);

  function getAnswer(id: number) {
    return answers[id] ?? { answer: "", topic: "", sendToClient: true, save: true };
  }
  function setAnswer(id: number, data: Partial<typeof answers[number]>) {
    setAnswers((prev) => ({ ...prev, [id]: { ...getAnswer(id), ...data } }));
  }

  async function resolve(id: number) {
    const a = getAnswer(id);
    if (!a.answer.trim()) return;
    setSubmitting(id);
    await fetch(`/api/julieta/alerts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: a.answer,
        topic: a.topic || alerts.find(al => al.id === id)?.question?.slice(0, 50),
        saveAsLearning: a.save,
        sendToClient: a.sendToClient,
      }),
    });
    setSubmitting(null);
    setExpanded(null);
    fetch_();
  }

  if (alerts.length === 0) return null;

  return (
    <div className="border-b bg-orange-50">
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-orange-500 font-bold text-sm">🤖 Julieta necesita ayuda</span>
          <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">{alerts.length}</span>
        </div>
        <span className="text-xs text-orange-400">Responde y Julieta aprende</span>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {alerts.map((alert) => (
          <div key={alert.id} className="border-t border-orange-100 px-4 py-3">
            <div
              className="flex items-start justify-between cursor-pointer"
              onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-orange-600">
                    {alert.contact_name ?? alert.phone ?? "Desconocido"}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(alert.created_at * 1000).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 font-medium">"{alert.question}"</p>
                {alert.julieta_response && (
                  <p className="text-xs text-gray-400 mt-0.5 italic line-clamp-1">Julieta: {alert.julieta_response}</p>
                )}
              </div>
              <span className="text-gray-400 text-sm ml-2">{expanded === alert.id ? "▲" : "▼"}</span>
            </div>

            {expanded === alert.id && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Tema del aprendizaje</label>
                  <input
                    value={getAnswer(alert.id).topic}
                    onChange={(e) => setAnswer(alert.id, { topic: e.target.value })}
                    placeholder={alert.question.slice(0, 50)}
                    className="w-full border rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Tu respuesta para Julieta *</label>
                  <textarea
                    value={getAnswer(alert.id).answer}
                    onChange={(e) => setAnswer(alert.id, { answer: e.target.value })}
                    rows={3}
                    placeholder="Escribe la respuesta correcta. Julieta la usará en el futuro..."
                    className="w-full border rounded px-2 py-1 text-sm mt-1 resize-none"
                  />
                </div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={getAnswer(alert.id).save} onChange={(e) => setAnswer(alert.id, { save: e.target.checked })} />
                    <span className="text-gray-600">Guardar en aprendizaje</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={getAnswer(alert.id).sendToClient} onChange={(e) => setAnswer(alert.id, { sendToClient: e.target.checked })} />
                    <span className="text-gray-600">Enviar respuesta al cliente</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExpanded(null)} className="px-3 py-1.5 border rounded text-sm">Cancelar</button>
                  <button
                    onClick={() => resolve(alert.id)}
                    disabled={!getAnswer(alert.id).answer.trim() || submitting === alert.id}
                    className="px-4 py-1.5 bg-orange-500 text-white rounded text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                  >
                    {submitting === alert.id ? "Guardando..." : "✓ Resolver y enseñar a Julieta"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
