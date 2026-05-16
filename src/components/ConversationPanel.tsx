"use client";

import { useState, useEffect, useRef } from "react";
import ModeToggle from "./ModeToggle";

interface PaymentProof {
  id: number; filename: string; mimetype: string; reviewed: number; created_at: number;
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
          <p className="text-xs text-yellow-800">{content}</p>
          <p className="text-xs text-yellow-400 text-right mt-0.5">{formatTime(createdAt)}</p>
        </div>
      </div>
    );
  }
  const isLeft = role === "user";
  const bubbleClass = isLeft ? "bg-white border border-gray-200 text-gray-800"
    : role === "assistant" ? "bg-emerald-500 text-white"
    : "bg-amber-400 text-white";
  return (
    <div className={`flex ${isLeft ? "justify-start" : "justify-end"} mb-2`}>
      <div className="max-w-[75%]">
        {!isLeft && <div className="text-xs text-gray-400 text-right mb-0.5 pr-1">{role === "assistant" ? "IA" : "Agente"}</div>}
        <div className={`rounded-2xl px-4 py-2 text-sm ${bubbleClass}`}>{content}</div>
        <div className={`text-xs text-gray-400 mt-0.5 ${isLeft ? "pl-1" : "pr-1 text-right"}`}>{formatTime(createdAt)}</div>
      </div>
    </div>
  );
}

type PanelTab = "chat" | "notes" | "info";

export default function ConversationPanel({ conversation, onModeChange, onDelete }: ConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"AI" | "HUMAN">(conversation.mode);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [tab, setTab] = useState<PanelTab>("chat");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [csatSent, setCsatSent] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const convId = conversation.id;

  useEffect(() => {
    setMode(conversation.mode);
    fetchMessages();
    fetchProofs();
    fetchTags();
    setSummary(null);
    setCsatSent(false);
    setTab("chat");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  useEffect(() => {
    if (tab === "chat") bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  useEffect(() => {
    const iv = setInterval(fetchMessages, 2000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  useEffect(() => {
    fetch("/api/templates").then(r => r.json()).then(d => setTemplates(d.templates ?? []));
  }, []);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/messages/${convId}`);
      if (!res.ok) return;
      setMessages((await res.json()).messages);
    } catch {}
  }
  async function fetchProofs() {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const data = await res.json();
      setProofs((data.proofs ?? []).filter((p: PaymentProof & { conversation_id: number }) => p.conversation_id === convId));
    } catch {}
  }
  async function fetchTags() {
    try {
      const res = await fetch(`/api/conversations/${convId}/tags`);
      if (!res.ok) return;
      setTags((await res.json()).tags ?? []);
    } catch {}
  }
  async function approveProof(id: number) {
    const res = await fetch(`/api/alerts/${id}/approve`, { method: "POST" });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Error al aprobar"); return; }
    setProofs(prev => prev.map(p => p.id === id ? { ...p, reviewed: 1 } : p));
    await fetchMessages();
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
    setNoteDraft(""); await fetchMessages();
    setTab("chat");
  }
  async function handleAddTag() {
    if (!newTag.trim()) return;
    const res = await fetch(`/api/conversations/${convId}/tags`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: newTag.trim() }),
    });
    setTags((await res.json()).tags ?? []);
    setNewTag("");
  }
  async function handleRemoveTag(t: string) {
    const res = await fetch(`/api/conversations/${convId}/tags`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: t }),
    });
    setTags((await res.json()).tags ?? []);
  }
  async function handleSummary() {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/conversations/${convId}/summary`);
      setSummary((await res.json()).summary);
    } finally { setSummaryLoading(false); }
  }
  async function handleCsat() {
    await fetch(`/api/conversations/${convId}/csat`, { method: "POST" });
    setCsatSent(true);
  }
  function handleModeChange(m: "AI" | "HUMAN") { setMode(m); onModeChange(convId, m); }
  async function handleDelete() {
    await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
    onDelete(convId); setShowDeleteConfirm(false);
  }
  function useTemplate(t: Template) { setDraft(t.content); setShowTemplates(false); }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="min-w-0">
          <div className="font-medium text-gray-800 truncate">{conversation.name ?? conversation.phone}</div>
          {conversation.name && <div className="text-xs text-gray-400">{conversation.phone}</div>}
          {tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-0.5">
              {tags.map(t => (
                <span key={t} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ModeToggle conversationId={convId} mode={mode} onChange={handleModeChange} />
          <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-red-400 hover:text-red-600">Borrar</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-100 bg-white shrink-0">
        {([["chat","💬 Chat"],["notes","📌 Notas"],["info","ℹ️ Info"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as PanelTab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === id ? "text-emerald-600 border-b-2 border-emerald-500" : "text-gray-400 hover:text-gray-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Chat tab */}
      {tab === "chat" && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
            {messages.length === 0 && <div className="text-center text-gray-400 text-sm mt-8">Sin mensajes aún.</div>}
            {messages.map(m => <MessageBubble key={m.id} role={m.role} content={m.content} createdAt={m.created_at} />)}
            <div ref={bottomRef} />
          </div>

          {/* Comprobantes de pago */}
          {proofs.length > 0 && (
            <div className="px-4 py-2 border-t bg-amber-50 shrink-0">
              <p className="text-xs font-semibold text-amber-700 mb-1.5">📎 Comprobantes de pago</p>
              <div className="flex gap-2 flex-wrap">
                {proofs.map(p => (
                  <div key={p.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border text-xs ${p.reviewed ? "bg-gray-50 border-gray-200 text-gray-400" : "bg-white border-amber-300 text-amber-800"}`}>
                    <a href={`/uploads/proofs/${p.filename}`} target="_blank" rel="noopener noreferrer" className="underline">
                      {p.filename.split(".").pop()?.toUpperCase()} · {formatTime(p.created_at)}
                    </a>
                    {!p.reviewed && (
                      <button onClick={() => approveProof(p.id)} className="bg-emerald-500 text-white px-2 py-0.5 rounded font-medium hover:bg-emerald-600">✓ Aprobar</button>
                    )}
                    {p.reviewed && <span className="text-emerald-500">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acciones rápidas */}
          <div className="px-4 pt-2 flex gap-2 shrink-0 flex-wrap">
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
              {csatSent ? "✓ CSAT enviada" : "⭐ Pedir calificación"}
            </button>
            <button onClick={() => setTab("notes")}
              className="text-xs text-yellow-600 bg-yellow-50 hover:bg-yellow-100 px-2 py-1 rounded-lg">
              📌 Nota interna
            </button>
          </div>

          {/* Resumen IA */}
          {summary && (
            <div className="mx-4 mb-2 bg-purple-50 border border-purple-200 rounded-xl p-3 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-purple-700">🤖 Resumen IA</p>
                <button onClick={() => setSummary(null)} className="text-xs text-purple-400">✕</button>
              </div>
              <p className="text-xs text-purple-800 whitespace-pre-line">{summary}</p>
            </div>
          )}

          {/* Plantillas */}
          {showTemplates && (
            <div className="mx-4 mb-2 bg-white border rounded-xl shadow-lg shrink-0 max-h-48 overflow-y-auto">
              <div className="p-2 border-b flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">Plantillas rápidas</p>
                <button onClick={() => setShowTemplates(false)} className="text-xs text-gray-400">✕</button>
              </div>
              {templates.length === 0 && <p className="text-xs text-gray-400 p-3 text-center">Sin plantillas. Agrégalas en Ajustes → Plantillas.</p>}
              {templates.map(t => (
                <button key={t.id} onClick={() => useTemplate(t)}
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
              <div className="text-sm text-gray-400 text-center py-2">El bot responde automáticamente en modo IA.</div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-amber-400 transition-colors" />
                <button onClick={handleSend} disabled={!draft.trim() || sending}
                  className="bg-amber-400 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50 transition-colors">
                  Enviar
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Notes tab */}
      {tab === "notes" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
            {messages.filter(m => m.role === "note").length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-8">Sin notas internas.</div>
            )}
            {messages.filter(m => m.role === "note").map(m => (
              <MessageBubble key={m.id} role="note" content={m.content} createdAt={m.created_at} />
            ))}
          </div>
          <div className="px-4 py-3 border-t bg-white shrink-0">
            <p className="text-xs text-gray-400 mb-2">Las notas son visibles solo para tu equipo.</p>
            <div className="flex gap-2">
              <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSendNote()}
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

      {/* Info tab */}
      {tab === "info" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
          {/* Tags */}
          <div className="bg-white border rounded-xl p-4 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Etiquetas</p>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {t}
                  <button onClick={() => handleRemoveTag(t)} className="text-blue-400 hover:text-blue-600 leading-none">×</button>
                </span>
              ))}
              {tags.length === 0 && <span className="text-xs text-gray-400">Sin etiquetas</span>}
            </div>
            <div className="flex gap-2">
              <input value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddTag()}
                placeholder="Nueva etiqueta..." className="flex-1 border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-400" />
              <button onClick={handleAddTag} disabled={!newTag.trim()}
                className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-600 disabled:opacity-50">+</button>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white border rounded-xl p-4 mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Estadísticas</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-800">{messages.filter(m => m.role !== "note").length}</p>
                <p className="text-xs text-gray-400">Mensajes</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-800">{messages.filter(m => m.role === "user").length}</p>
                <p className="text-xs text-gray-400">Del cliente</p>
              </div>
            </div>
          </div>

          {/* Summary */}
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

      {/* Confirm delete */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">¿Borrar conversación?</h3>
            <p className="text-sm text-gray-500 mb-4">Se eliminarán todos los mensajes de <strong>{conversation.name ?? conversation.phone}</strong>.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
