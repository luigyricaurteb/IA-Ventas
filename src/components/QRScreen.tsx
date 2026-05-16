"use client";

import { useEffect, useState, useRef } from "react";

interface QRScreenProps {
  onConnected: (phone: string) => void;
}

export default function QRScreen({ onConnected }: QRScreenProps) {
  const [qrPng, setQrPng]       = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<string>("disconnected");
  const [waitSecs, setWaitSecs]  = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const lastUpdatedAt = useRef<number>(0);
  const connectedRef  = useRef(false);

  async function fetchStatus(silent = false) {
    try {
      const res  = await fetch("/api/connection/status");
      const data = await res.json() as {
        status: string; phone?: string; qrPng?: string; updatedAt?: number;
      };

      if (connectedRef.current) return;

      setBotStatus(data.status);

      if (data.status === "connected" && data.phone) {
        connectedRef.current = true;
        onConnected(data.phone);
        return;
      }

      // QR cambió → actualizar sin parpadeo
      if (data.qrPng && data.updatedAt && data.updatedAt !== lastUpdatedAt.current) {
        lastUpdatedAt.current = data.updatedAt;
        if (!silent) setRefreshing(true);
        setQrPng(data.qrPng);
        setTimeout(() => setRefreshing(false), 300);
      }
    } catch {}
  }

  useEffect(() => {
    fetchStatus();
    // Poll cada 2s: recoge el QR nuevo automáticamente cada vez que WhatsApp lo rota
    const iv = setInterval(() => fetchStatus(true), 2000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador de espera
  useEffect(() => {
    const t = setInterval(() => setWaitSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        {/* Header */}
        <div className="mb-5">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📱</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800">Conectar WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">
            Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
          </p>
        </div>

        {/* Estado */}
        <div className={`flex items-center justify-center gap-2 text-xs mb-4 font-medium ${
          qrPng ? "text-emerald-600" : "text-amber-500"
        }`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            qrPng ? "bg-emerald-500" : "bg-amber-400 animate-pulse"
          }`} />
          {qrPng
            ? (refreshing ? "Actualizando QR..." : "QR activo — escanea ahora")
            : botStatus === "connecting" ? "Conectando con WhatsApp..."
            : "Iniciando bot..."}
        </div>

        {/* QR o spinner */}
        {qrPng ? (
          <div className="relative inline-block">
            <img
              src={qrPng}
              alt="QR de WhatsApp"
              className={`w-64 h-64 rounded-xl border-4 border-emerald-50 mx-auto transition-opacity duration-300 ${
                refreshing ? "opacity-60" : "opacity-100"
              }`}
            />
            {/* Overlay de recarga sutil */}
            {refreshing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/40">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="py-10">
            <div className="w-12 h-12 rounded-full animate-spin mx-auto mb-4"
              style={{ border: "3px solid #e5e7eb", borderTopColor: "#10b981" }} />
            {waitSecs < 20 && <p className="text-sm text-gray-400">Generando código QR...</p>}
            {waitSecs >= 20 && waitSecs < 50 && (
              <p className="text-sm text-gray-400">
                El bot está iniciando en el servidor.<br />
                <span className="text-xs text-gray-300">Puede tardar hasta 30 segundos.</span>
              </p>
            )}
            {waitSecs >= 50 && (
              <div className="space-y-3">
                <p className="text-sm text-amber-600 font-medium">Tomando más tiempo de lo normal</p>
                <p className="text-xs text-gray-400">
                  El servidor podría estar reiniciando. Espera un momento más.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600"
                >
                  Recargar página
                </button>
              </div>
            )}
          </div>
        )}

        {/* Info pie */}
        {qrPng && (
          <p className="text-xs text-gray-400 mt-3">
            El código se actualiza automáticamente. No necesitas hacer nada, solo escanearlo.
          </p>
        )}
      </div>
    </div>
  );
}
