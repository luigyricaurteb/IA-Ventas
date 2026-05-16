"use client";

interface ModeToggleProps {
  conversationId: number;
  mode: "AI" | "HUMAN";
  onChange: (mode: "AI" | "HUMAN") => void;
}

export default function ModeToggle({ conversationId, mode, onChange }: ModeToggleProps) {
  async function toggle() {
    const next = mode === "AI" ? "HUMAN" : "AI";
    await fetch(`/api/mode/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    onChange(next);
  }

  return (
    <button
      onClick={toggle}
      className={`px-3 py-1 rounded-full text-sm font-semibold transition-colors ${
        mode === "AI"
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-amber-100 text-amber-700 hover:bg-amber-200"
      }`}
    >
      {mode === "AI" ? "IA" : "HUMANO"}
    </button>
  );
}
