interface MessageBubbleProps {
  role: "user" | "assistant" | "human";
  content: string;
  createdAt: number;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageBubble({ role, content, createdAt }: MessageBubbleProps) {
  const isLeft = role === "user";

  const bubbleClass = isLeft
    ? "bg-white border border-gray-200 text-gray-800"
    : role === "assistant"
    ? "bg-emerald-500 text-white"
    : "bg-amber-400 text-white";

  return (
    <div className={`flex ${isLeft ? "justify-start" : "justify-end"} mb-2`}>
      <div className="max-w-[75%]">
        {!isLeft && (
          <div className="text-xs text-gray-400 text-right mb-0.5 pr-1">
            {role === "assistant" ? "IA" : "Humano"}
          </div>
        )}
        <div className={`rounded-2xl px-4 py-2 text-sm ${bubbleClass}`}>
          {content}
        </div>
        <div className={`text-xs text-gray-400 mt-0.5 ${isLeft ? "pl-1" : "pr-1 text-right"}`}>
          {formatTime(createdAt)}
        </div>
      </div>
    </div>
  );
}
