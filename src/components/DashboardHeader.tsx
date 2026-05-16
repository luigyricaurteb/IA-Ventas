"use client";

interface DashboardHeaderProps {
  phone: string | null;
  onDisconnect: () => void;
  currentUser?: { name: string; role?: string } | null;
  onLogout?: () => void;
}

export default function DashboardHeader({ phone, onDisconnect, currentUser, onLogout }: DashboardHeaderProps) {
  async function handleDisconnect() {
    if (!confirm("¿Desconectar el número? Tendrás que escanear el QR nuevamente.")) return;
    await fetch("/api/connection/disconnect", { method: "POST" });
    onDisconnect();
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="font-semibold text-gray-800">Agente WhatsApp</span>
        {phone && (
          <span className="text-sm text-gray-400 ml-2">+{phone}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {currentUser && (
          <div className="hidden md:flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
              {currentUser.name[0].toUpperCase()}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700 leading-none">{currentUser.name}</p>
              <p className="text-xs text-gray-400 capitalize">{currentUser.role}</p>
            </div>
          </div>
        )}
        <button onClick={handleDisconnect} className="text-sm text-gray-400 hover:text-red-500 transition-colors">WA Off</button>
        {onLogout && (
          <button onClick={onLogout} className="text-sm text-red-500 hover:text-red-700 transition-colors font-medium">Salir</button>
        )}
      </div>
    </header>
  );
}
