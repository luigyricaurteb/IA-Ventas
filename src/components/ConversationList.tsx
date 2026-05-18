"use client";

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  last_message_at: number | null;
  last_message_preview: string | null;
  channel?: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const LID_RE = /^\d{14,}$/;
function displayLabel(name: string | null, phone: string): string {
  if (name) return name;
  if (LID_RE.test(phone)) return "Contacto (pendiente)";
  if (phone.startsWith("fb_")) return "Usuario de Facebook";
  if (phone.startsWith("ig_")) return "Usuario de Instagram";
  return `+${phone}`;
}

function channelBadge(channel?: string) {
  switch (channel) {
    case "instagram": return { icon: "📸", label: "IG",  cls: "bg-pink-100 text-pink-600" };
    case "facebook":  return { icon: "📘", label: "FB",  cls: "bg-blue-100 text-blue-600" };
    default:          return { icon: "📱", label: "WA",  cls: "bg-emerald-100 text-emerald-600" };
  }
}

function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-gray-400 text-sm">
        Sin conversaciones aún.
        <br />
        Espera un mensaje entrante.
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {conversations.map((c) => (
        <li
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 transition-colors ${
            selectedId === c.id ? "bg-emerald-50 border-l-2 border-l-emerald-500" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-0.5 gap-1">
            <span className="font-medium text-gray-800 text-sm truncate flex-1">
              {displayLabel(c.name, c.phone)}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {/* Badge de canal */}
              {(() => { const b = channelBadge(c.channel); return (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${b.cls}`} title={b.label}>
                  {b.icon}
                </span>
              ); })()}
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                c.mode === "AI" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
              }`}>
                {c.mode === "AI" ? "IA" : "HUMANO"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 truncate flex-1">
              {c.last_message_preview ?? "Sin mensajes"}
            </p>
            <span className="text-xs text-gray-300 ml-2 shrink-0">
              {relativeTime(c.last_message_at)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
