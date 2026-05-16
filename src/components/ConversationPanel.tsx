"use client";

import { useState, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import ModeToggle from "./ModeToggle";

interface PaymentProof {
  id: number; filename: string; mimetype: string; reviewed: number; created_at: number;
}

interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: number;
}

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
}

interface ConversationPanelProps {
  conversation: Conversation;
  onModeChange: (id: number, mode: "AI" | "HUMAN") => void;
  onDelete: (id: number) => void;
}

export default function ConversationPanel({
  conversation,
  onModeChange,
  onDelete,
}: ConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<"AI" | "HUMAN">(conversation.mode);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function fetchProofs() {
    try {
      const res = await fetch(`/api/alerts`);
      if (!res.ok) return;
      const data = await res.json();
      setProofs((data.proofs ?? []).filter((p: PaymentProof & { conversation_id: number }) => p.conversation_id === conversation.id));
    } catch {}
  }

  async function approveProof(id: number) {
    const res = await fetch(`/api/alerts/${id}/approve`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Error al aprobar");
      return;
    }
    setProofs((prev) => prev.map((p) => p.id === id ? { ...p, reviewed: 1 } : p));
    // Refrescar mensajes para mostrar la confirmación enviada
    await fetchMessages();
  }

  useEffect(() => {
    setMode(conversation.mode);
    fetchMessages();
    fetchProofs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Polling de mensajes cada 2s
  useEffect(() => {
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/messages/${conversation.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages);
    } catch {}
  }

  async function handleSend() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/messages/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      setDraft("");
      await fetchMessages();
    } finally {
      setSending(false);
    }
  }

  function handleModeChange(newMode: "AI" | "HUMAN") {
    setMode(newMode);
    onModeChange(conversation.id, newMode);
  }

  async function handleDelete() {
    await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    onDelete(conversation.id);
    setShowDeleteConfirm(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header del panel */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div>
          <div className="font-medium text-gray-800">
            {conversation.name ?? conversation.phone}
          </div>
          {conversation.name && (
            <div className="text-xs text-gray-400">{conversation.phone}</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            conversationId={conversation.id}
            mode={mode}
            onChange={handleModeChange}
          />
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            Borrar
          </button>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">Sin mensajes aún.</div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            createdAt={m.created_at}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Comprobantes de pago */}
      {proofs.length > 0 && (
        <div className="px-4 py-2 border-t bg-amber-50 shrink-0">
          <p className="text-xs font-semibold text-amber-700 mb-1.5">📎 Comprobantes de pago recibidos</p>
          <div className="flex gap-2 flex-wrap">
            {proofs.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border text-xs ${p.reviewed ? "bg-gray-50 border-gray-200 text-gray-400" : "bg-white border-amber-300 text-amber-800"}`}>
                <a href={`/uploads/proofs/${p.filename}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900">
                  {p.filename.split(".").pop()?.toUpperCase()} — {new Date(p.created_at * 1000).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                </a>
                {!p.reviewed && (
                  <button onClick={() => approveProof(p.id)} className="bg-emerald-500 text-white px-2 py-0.5 rounded font-medium hover:bg-emerald-600">
                    ✓ Aprobar reserva
                  </button>
                )}
                {p.reviewed && <span className="text-emerald-500">✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
        {mode === "AI" ? (
          <div className="text-sm text-gray-400 text-center py-2">
            El bot responde automáticamente en modo IA.
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Escribe un mensaje..."
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-amber-400 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              className="bg-amber-400 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Enviar
            </button>
          </div>
        )}
      </div>

      {/* Modal confirmación borrar */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">¿Borrar conversación?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Se eliminarán todos los mensajes de{" "}
              <strong>{conversation.name ?? conversation.phone}</strong>. Esta acción no se puede
              deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
