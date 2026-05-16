"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface PaymentProof {
  id: number; filename: string; mimetype: string; reviewed: number; created_at: number;
  ai_amount?: number | null; ai_reference?: string | null; ai_payer?: string | null;
  ai_date?: string | null; ai_bank?: string | null;
  conversation_id?: number;
}
interface Message {
  id: number; conversation_id: number;
  role: "user" | "assistant" | "human" | "note";
  content: string; created_at: number;
}
interface Template { id: number; name: string; content: string; category: string | null }
interface Conversation {
  id: number; phone: string; name: string | null; mode: "AI" | "HUMAN";
}
interface ConversationPanelProps {
  conversation: Conversation;
  onModeChange: (id: number, mode: "AI" | "HUMAN") => void;
  onDelete: (id: number) => void;
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ role, content, createdAt }: { role: Message["role"]; content: string; createdAt: number }) {
  if (role === "note") {
    return (
      <div className="flex justify-center mb-2">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-1.5 max-w-[80%]">
          <p className="text-xs text-yellow-600 font-medium mb-0.5">📌 Nota interna</p>
          <p className="text-xs text-yellow-800 whitespace-pre-wrap">{content}</p>
          <p className="text-xs text-yellow-400 text-right mt-0.5">{formatTime(createdAt)}</p>
        </div>
      </div>
    );
  }
  const isLeft = role === "user";
  const bubbleClass = isLeft
    ? "bg-white border border-gray-200 text-gray-800"
    : role === "assistant" ? "bg-emerald-500 text-white" : "bg-amber-400 text-white";
  return (
    <div className={`flex ${isLeft ? "justify-start" : "justify-end"} mb-2`}>
      <div className="max-w-[75%]">
        {!isLeft && (
          <div className="text-xs text-gray-400 text-right mb-0.5 pr-1">
            {role === "assistant" ? "🤖 IA" : "👤 Agente"}
          </div>
        )}
        <div className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${bubbleClass}`}>{content}</div>
        <div className={`text-xs text-gray-400 mt-0.5 ${isLeft ? "pl-1" : "pr-1 text-right"}`}>
          {formatTime(createdAt)}
        </div>
      </div>
    </div>
  );
}

type PanelTab = "chat" | "notes" | "info";

export default function ConversationPanel({ conversation, onModeChange, onDelete }: ConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode]         = useState<"AI" | "HUMAN">(conversation.mode);
  const [draft, setDraft]       = useState("");
  const [sending, setSending]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [proofs, setProofs]     = useState<PaymentProof[]>([]);
  const [tab, setTab]           = useState<PanelTab>("chat");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tags, setTags]         = useState<string[]>([]);
  const [newTag, setNewTag]     = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [summary, setSummary]   = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [csatSent, setCsatSent]       = useState(false);
  const [resetting, setResetting]     = useState(false);
  const [learning, setLearning]       = useState(false);
  const [learnResult, setLearnResult] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const convId = conversation.id;

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${convId}`);
      if (!res.ok) return;
      const data = await res.json() as { messages: Message[] };
      setMessages(data.messages ?? []);
    } catch {}
  }, [convId]);

  useEffect(() => {
    setMode(conversation.mode);
    fetchMessages();
    fetchProofs();
    fetchTags();
    setSummary(null); setCsatSent(false); setTab("chat");
    fetch("/api/templates").then(r => r.json()).then((d: { templates: Template[] }) => setTemplates(d.templates ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  useEffect(() => {
    if (tab === "chat") bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  useEffect(() => {
    const iv = setInterval(fetchMessages, 2000);
    return () => clearInterval(iv);
  }, [fetchMessages]);

  async function fetchProofs() {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const data = await res.json() as { proofs: (PaymentProof & { conversation_id: number })[] };
      setProofs((data.proofs ?? []).filter(p => p.conversation_id === convId));
    } catch {}
  }

  async function fetchTags() {
    try {
      const res = await fetch(`/api/conversations/${convId}/tags`);
      if (!res.ok) return;
      setTags(((await res.json()) as { tags: string[] }).tags ?? []);
    } catch {}
  }

  async function approveProof(id: number, type: "full" | "partial" = "full", amount?: number) {
    const res = await fetch(`/api/alerts/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, amount }),
    });
    if (!res.ok) { const d = await res.json() as { error: string }; alert(d.error ?? "Error al aprobar"); return; }
    const d = await res.json() as { isFullyPaid?: boolean; saldo?: number; newPaidTotal?: number; totalValue?: number };
    setProofs(prev => prev.map(p => p.id === id ? { ...p, reviewed: 1 } : p));
    await fetchMessages();
    if (d.isFullyPaid === false && d.saldo) {
      alert(`Abono registrado. Saldo pendiente: $${d.saldo.toLocaleString("es-CO")} COP`);
    }
  }

  async function toggleMode() {
    const next = mode === "AI" ? "HUMAN" : "AI";
    await fetch(`/api/mode/${convId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    setMode(next);
    onModeChange(convId, next);
  }

  async function handleSend() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/messages/${convId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      setDraft(""); await fetchMessages();
    } finally { setSending(false); }
  }

  async function handleSendNote() {
    if (!noteDraft.trim()) return;
    await fetch(`/api/conversations/${convId}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteDraft.trim() }),
    });
    setNoteDraft(""); await fetchMessages(); setTab("chat");
  }

  async function handleAddTag() {
    if (!newTag.trim()) return;
    const res = await fetch(`/api/conversations/${convId}/tags`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: newTag.trim() }),
    });
    setTags(((await res.json()) as { tags: string[] }).tags ?? []);
    setNewTag("");
  }

  async function handleRemoveTag(t: string) {
    const res = await fetch(`/api/conversations/${convId}/tags`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: t }),
    });
    setTags(((await res.json()) as { tags: string[] }).tags ?? []);
  }

  async function handleSummary() {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/conversations/${convId}/summary`);
      setSummary(((await res.json()) as { summary: string }).summary);
    } finally { setSummaryLoading(false); }
  }

  async function handleCsat() {
    await fetch(`/api/conversations/${convId}/csat`, { method: "POST" });
    setCsatSent(true);
  }

  async function handleDelete() {
    await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
    onDelete(convId); setShowDeleteConfirm(false);
  }

  async function handleLearn() {
    setLearning(true); setLearnResult(null);
    try {
      const res = await fetch(`/api/conversations/${convId}/learn`, { method: "POST" });
      const d = await res.json() as { count?: number; saved?: { topic: string }[]; error?: string };
      if (res.ok) {
        setLearnResult(`✓ ${d.count} aprendizaje${d.count !== 1 ? "s" : ""} extraído${d.count !== 1 ? "s" : ""} y guardado${d.count !== 1 ? "s" : ""} para Julieta`);
      } else {
        setLearnResult(`Error: ${d.error}`);
      }
      setTimeout(() => setLearnResult(null), 6000);
    } catch {
      setLearnResult("Error de conexión");
    } finally {
      setLearning(false);
    }
  }

  async function handleReset() {
    if (!confirm("¿Reiniciar conversación? El bot comenzará un nuevo flujo desde cero en el próximo mensaje del cliente. Los mensajes anteriores no se borran.")) return;
    setResetting(true);
    await fetch(`/api/conversations/${convId}/reset`, { method: "POST" });
    setResetting(false);
    await fetchMessages();
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 truncate">{conversation.name ?? conversation.phone}</p>
            {conversation.name && <p className="text-xs text-gray-400">{conversation.phone}</p>}
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-0.5">
                {tags.map(t => (
                  <span key={t} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* ── Modo IA / Humano — botón prominente ── */}
            <button
              onClick={toggleMode}
              title={mode === "AI" ? "Cambiar a modo HUMANO (responder tú)" : "Cambiar a modo IA (Julieta responde)"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all border-2 ${
                mode === "AI"
                  ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600"
                  : "bg-amber-400 text-white border-amber-400 hover:bg-amber-500"
              }`}
            >
              {mode === "AI" ? (
                <><span>🤖</span><span className="hidden sm:inline">IA activa</span></>
              ) : (
                <><span>👤</span><span className="hidden sm:inline">Tú respondes</span></>
              )}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5"
            >
              🗑️
            </button>
          </div>
        </div>

        {/* Modo actual — aviso claro */}
        <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
          mode === "AI"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
        }`}>
          {mode === "AI"
            ? "🤖 Julieta está respondiendo automáticamente. Toca el botón para tomar el control."
            : "👤 Estás respondiendo manualmente. Toca el botón para activar la IA."}
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 bg-white shrink-0">
        {(["chat","notes","info"] as PanelTab[]).map(id => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === id ? "text-emerald-600 border-b-2 border-emerald-500" : "text-gray-400 hover:text-gray-600"}`}>
            {id === "chat" ? "💬 Chat" : id === "notes" ? "📌 Notas" : "ℹ️ Info"}
          </button>
        ))}
      </div>

      {/* ── CHAT TAB ────────────────────────────────────────────────────── */}
      {tab === "chat" && (
        <>
          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-8">Sin mensajes aún.</div>
            )}
            {messages.map(m => <MessageBubble key={m.id} role={m.role} content={m.content} createdAt={m.created_at} />)}
            <div ref={bottomRef} />
          </div>

          {/* Comprobantes de pago */}
          {proofs.length > 0 && (
            <div className="px-4 py-3 border-t bg-amber-50 shrink-0">
              <p className="text-xs font-semibold text-amber-700 mb-2">📎 Comprobantes de pago</p>
              <div className="space-y-2">
                {proofs.map(p => (
                  <div key={p.id} className={`rounded-xl border text-xs ${p.reviewed ? "bg-gray-50 border-gray-200" : "bg-white border-amber-300"}`}>
                    {/* Info extraída por IA */}
                    <div className="px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`/uploads/proofs/${p.filename}`} target="_blank" rel="noopener noreferrer"
                          className="underline text-blue-600 font-medium">
                          Ver {p.filename.split(".").pop()?.toUpperCase()}
                        </a>
                        <span className="text-gray-400">{formatTime(p.created_at)}</span>
                        {p.reviewed && <span className="text-emerald-600 font-medium">✓ Aprobado</span>}
                      </div>

                      {/* Datos extraídos por IA */}
                      {(p.ai_amount || p.ai_payer || p.ai_reference || p.ai_bank) && (
                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
                          {p.ai_amount && (
                            <span className="col-span-2 font-bold text-emerald-700 text-sm">
                              💵 ${p.ai_amount.toLocaleString("es-CO")} COP
                            </span>
                          )}
                          {p.ai_payer    && <span>👤 {p.ai_payer}</span>}
                          {p.ai_bank     && <span>🏦 {p.ai_bank}</span>}
                          {p.ai_date     && <span>📅 {p.ai_date}</span>}
                          {p.ai_reference && <span>🔖 Ref: {p.ai_reference}</span>}
                        </div>
                      )}
                      {!p.ai_amount && !p.reviewed && (
                        <p className="text-gray-400 mt-1">⏳ Leyendo comprobante...</p>
                      )}
                    </div>

                    {/* Botones de aprobación */}
                    {!p.reviewed && (
                      <div className="px-3 pb-2 flex gap-2 flex-wrap border-t border-amber-100 pt-2">
                        <button
                          onClick={() => approveProof(p.id, "full", p.ai_amount ?? undefined)}
                          className="bg-emerald-500 text-white px-3 py-1 rounded-lg font-medium hover:bg-emerald-600">
                          ✓ Aprobar pago completo
                        </button>
                        <button
                          onClick={() => approveProof(p.id, "partial", p.ai_amount ?? undefined)}
                          className="bg-amber-500 text-white px-3 py-1 rounded-lg font-medium hover:bg-amber-600">
                          📊 Registrar como abono
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acciones rápidas */}
          <div className="px-4 pt-2 pb-1 flex gap-2 shrink-0 flex-wrap bg-white border-t border-gray-100">
            <button onClick={handleSummary} disabled={summaryLoading}
              className="text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-lg disabled:opacity-50">
              {summaryLoading ? "⏳" : "🤖 Resumir"}
            </button>
            <button onClick={() => setShowTemplates(v => !v)}
              className="text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg">
              📝 Plantillas
            </button>
            <button onClick={handleCsat} disabled={csatSent}
              className="text-xs text-orange-600 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-lg disabled:opacity-50">
              {csatSent ? "✓ CSAT enviada" : "⭐ Calificación"}
            </button>
            <button onClick={() => setTab("notes")}
              className="text-xs text-yellow-700 bg-yellow-50 hover:bg-yellow-100 px-2 py-1 rounded-lg">
              📌 Nota
            </button>
            <button onClick={handleLearn} disabled={learning}
              className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg disabled:opacity-50"
              title="Extrae conocimientos de esta conversación y se los enseña a Julieta">
              {learning ? "⏳" : "🧠 Enseñar a Julieta"}
            </button>
            <button onClick={handleReset} disabled={resetting}
              className="text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg disabled:opacity-50"
              title="Reinicia el flujo del bot. No borra los mensajes.">
              {resetting ? "⏳" : "🔄 Nueva conv."}
            </button>
          </div>

          {/* Resultado de aprendizaje */}
          {learnResult && (
            <div className={`mx-4 mb-1 rounded-xl px-3 py-2 text-xs shrink-0 ${learnResult.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-indigo-50 text-indigo-700 border border-indigo-200"}`}>
              {learnResult}
            </div>
          )}

          {/* Resumen IA */}
          {summary && (
            <div className="mx-4 mb-1 bg-purple-50 border border-purple-200 rounded-xl p-3 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-purple-700">🤖 Resumen IA</p>
                <button onClick={() => setSummary(null)} className="text-xs text-purple-400">✕</button>
              </div>
              <p className="text-xs text-purple-800 whitespace-pre-line">{summary}</p>
            </div>
          )}

          {/* Plantillas */}
          {showTemplates && (
            <div className="mx-4 mb-1 bg-white border rounded-xl shadow-lg shrink-0 max-h-40 overflow-y-auto">
              <div className="p-2 border-b flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Plantillas rápidas</p>
                <button onClick={() => setShowTemplates(false)} className="text-xs text-gray-400">✕</button>
              </div>
              {templates.length === 0 && <p className="text-xs text-gray-400 p-3 text-center">Crea plantillas en Ajustes → Plantillas.</p>}
              {templates.map(t => (
                <button key={t.id} onClick={() => { setDraft(t.content); setShowTemplates(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0">
                  <p className="text-xs font-medium text-gray-800">{t.name}</p>
                  <p className="text-xs text-gray-400 truncate">{t.content}</p>
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
            {mode === "AI" ? (
              <div className="flex items-center gap-3 bg-emerald-50 rounded-xl px-4 py-2.5">
                <span className="text-lg">🤖</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-emerald-700">Julieta está respondiendo automáticamente</p>
                  <p className="text-xs text-emerald-500">Toca <strong>"👤 Tú respondes"</strong> para tomar el control</p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-amber-400 transition-colors"
                />
                <button onClick={handleSend} disabled={!draft.trim() || sending}
                  className="bg-amber-400 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50 transition-colors">
                  Enviar
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── NOTES TAB ───────────────────────────────────────────────────── */}
      {tab === "notes" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
            {messages.filter(m => m.role === "note").length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-8">Sin notas internas todavía.</div>
            )}
            {messages.filter(m => m.role === "note").map(m => (
              <MessageBubble key={m.id} role="note" content={m.content} createdAt={m.created_at} />
            ))}
          </div>
          <div className="px-4 py-3 border-t bg-white shrink-0">
            <p className="text-xs text-gray-400 mb-2">Las notas son visibles solo para tu equipo, no para el cliente.</p>
            <div className="flex gap-2">
              <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendNote()}
                placeholder="Escribe una nota interna..."
                className="flex-1 border border-yellow-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-yellow-400" />
              <button onClick={handleSendNote} disabled={!noteDraft.trim()}
                className="bg-yellow-400 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-yellow-500 disabled:opacity-50">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INFO TAB ────────────────────────────────────────────────────── */}
      {tab === "info" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 space-y-3">
          {/* Etiquetas */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Etiquetas</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {t}
                  <button onClick={() => handleRemoveTag(t)} className="text-blue-400 hover:text-blue-600">×</button>
                </span>
              ))}
              {tags.length === 0 && <span className="text-xs text-gray-400">Sin etiquetas</span>}
            </div>
            <div className="flex gap-2">
              <input value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddTag()}
                placeholder="Nueva etiqueta..." className="flex-1 border rounded-lg px-3 py-1.5 text-xs" />
              <button onClick={handleAddTag} disabled={!newTag.trim()}
                className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-600 disabled:opacity-50">+</button>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Estadísticas</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-800">{messages.filter(m => m.role !== "note").length}</p>
                <p className="text-xs text-gray-400">Total</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-800">{messages.filter(m => m.role === "user").length}</p>
                <p className="text-xs text-gray-400">Cliente</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-800">{messages.filter(m => m.role === "assistant").length}</p>
                <p className="text-xs text-gray-400">IA</p>
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Resumen IA</p>
            {summary ? (
              <p className="text-xs text-gray-700 whitespace-pre-line">{summary}</p>
            ) : (
              <button onClick={handleSummary} disabled={summaryLoading}
                className="w-full py-2 text-xs text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50">
                {summaryLoading ? "Generando..." : "🤖 Generar resumen"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm delete ──────────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">¿Borrar conversación?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Se eliminarán todos los mensajes de <strong>{conversation.name ?? conversation.phone}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
