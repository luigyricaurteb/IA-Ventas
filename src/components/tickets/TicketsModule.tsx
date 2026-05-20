"use client";
import { useState, useEffect } from "react";

interface Ticket {
  id: number; ticket_number: string; company_slug: string; company_name: string | null;
  title: string; description: string; priority: string; status: string;
  category: string | null; assigned_to: string | null;
  created_at: number; updated_at: number; resolved_at: number | null;
}
interface TicketMessage {
  id: number; author_role: string; author_name: string | null; content: string; created_at: number;
}

const PRIORITY_COLOR: Record<string, string> = {
  low:      "bg-gray-100 text-gray-600",
  medium:   "bg-blue-100 text-blue-700",
  high:     "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};
const STATUS_COLOR: Record<string, string> = {
  open:      "bg-yellow-100 text-yellow-700",
  in_review: "bg-blue-100 text-blue-700",
  resolved:  "bg-emerald-100 text-emerald-700",
  closed:    "bg-gray-100 text-gray-500",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Abierto", in_review: "En revisión", resolved: "Resuelto", closed: "Cerrado"
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Baja", medium: "Media", high: "Alta", critical: "Crítica"
};
const CATEGORIES = ["Soporte técnico", "Facturación", "Configuración", "Error del sistema", "Nueva función", "Otro"];

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TicketsModule({ isMaster }: { isMaster?: boolean }) {
  const [tickets, setTickets]         = useState<Ticket[]>([]);
  const [counts, setCounts]           = useState<Record<string, number>>({});
  const [selected, setSelected]       = useState<Ticket | null>(null);
  const [messages, setMessages]       = useState<TicketMessage[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [showNew, setShowNew]         = useState(false);
  const [newMsg, setNewMsg]           = useState("");
  const [sending, setSending]         = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", category: CATEGORIES[0] });
  const [creating, setCreating]       = useState(false);

  async function load() {
    const url = filterStatus ? `/api/tickets?status=${filterStatus}` : "/api/tickets";
    const d = await fetch(url).then(r => r.json()) as { tickets: Ticket[]; counts?: { status: string; c: number }[] };
    setTickets(d.tickets ?? []);
    if (d.counts) {
      const map: Record<string, number> = {};
      d.counts.forEach(c => { map[c.status] = c.c; });
      setCounts(map);
    }
  }

  async function loadTicket(t: Ticket) {
    setSelected(t);
    const d = await fetch(`/api/tickets/${t.id}`).then(r => r.json()) as { messages: TicketMessage[] };
    setMessages(d.messages ?? []);
  }

  useEffect(() => { load(); }, [filterStatus]);

  async function sendMessage() {
    if (!newMsg.trim() || !selected) return;
    setSending(true);
    await fetch(`/api/tickets/${selected.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newMsg }),
    });
    setNewMsg("");
    await loadTicket(selected);
    await load();
    setSending(false);
  }

  async function updateStatus(status: string) {
    if (!selected) return;
    await fetch(`/api/tickets/${selected.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    setSelected(prev => prev ? { ...prev, status } : null);
  }

  async function createTicket() {
    if (!form.title || !form.description) return;
    setCreating(true);
    await fetch("/api/tickets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowNew(false);
    setForm({ title: "", description: "", priority: "medium", category: CATEGORIES[0] });
    await load();
    setCreating(false);
  }

  const totalOpen = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Lista */}
      <div className={`flex flex-col border-r bg-white ${selected ? "hidden md:flex w-80 shrink-0" : "flex-1"}`}>
        {/* Header */}
        <div className="px-4 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">Soporte & Tickets</h2>
            <p className="text-xs text-gray-400">Reporta problemas, dudas o sugerencias al equipo de Hivo y haz seguimiento en tiempo real · {totalOpen} tickets</p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="text-white text-sm px-3 py-1.5 rounded-lg font-medium" style={{ background: "#0077b6" }}>
            + Nuevo
          </button>
        </div>

        {/* Filtros status */}
        <div className="flex gap-1 p-3 flex-wrap border-b">
          {["", "open", "in_review", "resolved", "closed"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {s === "" ? "Todos" : STATUS_LABEL[s]}
              {s !== "" && counts[s] ? ` (${counts[s]})` : ""}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tickets.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">🎫</p>
              <p className="text-sm">Sin tickets</p>
              {!isMaster && <button onClick={() => setShowNew(true)} className="mt-3 text-xs text-blue-600 underline">Crear el primero</button>}
            </div>
          )}
          {tickets.map(t => (
            <button key={t.id} onClick={() => loadTicket(t)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${selected?.id === t.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {isMaster && <p className="text-[10px] text-gray-400 mb-0.5">{t.company_name ?? t.company_slug}</p>}
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{t.ticket_number}</p>
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{fmt(t.updated_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Detalle */}
      {selected && (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b bg-white flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 md:hidden">←</button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 truncate">{selected.title}</p>
              <p className="text-xs text-gray-400">{selected.ticket_number} · {selected.company_name}</p>
            </div>
            {isMaster && (
              <select value={selected.status} onChange={e => updateStatus(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5">
                <option value="open">Abierto</option>
                <option value="in_review">En revisión</option>
                <option value="resolved">Resuelto</option>
                <option value="closed">Cerrado</option>
              </select>
            )}
          </div>

          {/* Descripción inicial */}
          <div className="px-4 py-3 bg-gray-50 border-b">
            <div className="flex gap-2 mb-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[selected.priority]}`}>{PRIORITY_LABEL[selected.priority]}</span>
              {selected.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{selected.category}</span>}
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.description}</p>
            <p className="text-xs text-gray-400 mt-1">{fmt(selected.created_at)}</p>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.author_role === "master" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${m.author_role === "master" ? "text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}
                  style={m.author_role === "master" ? { background: "#0077b6" } : {}}>
                  <p className="text-[10px] font-semibold mb-0.5 opacity-75">{m.author_name ?? m.author_role}</p>
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  <p className="text-[10px] opacity-60 mt-1 text-right">{fmt(m.created_at)}</p>
                </div>
              </div>
            ))}
            {messages.length === 0 && <p className="text-center text-gray-400 text-sm py-4">Sin respuestas aún</p>}
          </div>

          {/* Input mensaje */}
          {selected.status !== "closed" && (
            <div className="p-4 border-t bg-white flex gap-2">
              <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)}
                placeholder="Escribe tu mensaje..."
                rows={2} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none" />
              <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
                className="text-white px-4 rounded-xl text-sm font-medium disabled:opacity-50 self-end"
                style={{ background: "#0077b6" }}>
                {sending ? "..." : "→"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal nuevo ticket */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-5 border-b flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Nuevo ticket de soporte</h3>
              <button onClick={() => setShowNew(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Asunto *</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="Describe brevemente el problema" className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Categoría</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Prioridad</label>
                  <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm">
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Descripción detallada *</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  placeholder="Explica el problema con todo el detalle posible. ¿Qué ocurrió? ¿Qué esperabas que pasara?"
                  rows={5} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNew(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={createTicket} disabled={creating || !form.title || !form.description}
                  className="flex-1 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ background: "#0077b6" }}>
                  {creating ? "Creando..." : "Crear ticket"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
