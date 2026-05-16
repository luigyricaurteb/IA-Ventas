"use client";

import { useEffect, useState, useRef } from "react";

interface QRScreenProps {
  onConnected: (phone: string) => void;
}

export default function QRScreen({ onConnected }: QRScreenProps) {
  const [qrPng, setQrPng]         = useState<string | null>(null);
  const [status, setStatus]       = useState<string>("disconnected");
  const [waitSecs, setWaitSecs]   = useState(0);
  const lastUpdatedAt = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchStatus() {
    try {
      const res  = await fetch("/api/connection/status");
      const data = await res.json() as { status: string; phone?: string; qrPng?: string; updatedAt?: number };

      setStatus(data.status);

      if (data.status === "connected" && data.phone) {
        onConnected(data.phone);
        return;
      }

      // Solo actualizar QR si el updatedAt cambió (evita parpadeo)
      if (data.qrPng && data.updatedAt && data.updatedAt !== lastUpdatedAt.current) {
        lastUpdatedAt.current = data.updatedAt;
        setQrPng(data.qrPng);
      }
    } catch {}
  }

  useEffect(() => {
    fetchStatus(); // llamada inicial inmediata

    // Polling: cada 2s hasta conectar o hasta tener QR, luego cada 5s
    timerRef.current = setInterval(fetchStatus, 2500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador de espera para mostrar al usuario cuánto lleva
  useEffect(() => {
    const t = setInterval(() => setWaitSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const statusMsg: Record<string, string> = {
    disconnected: "Iniciando bot de WhatsApp...",
    connecting:   "Conectando con WhatsApp...",
    qr:           "QR listo — escanea ahora",
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="mb-6">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📱</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800">Conectar WhatsApp</h1>
          <p className="text-sm text-gray-400 mt-1">
            Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
          </p>
        </div>

        {/* Estado actual */}
        <div className={`flex items-center justify-center gap-2 text-sm mb-4 ${qrPng ? "text-emerald-600" : "text-gray-500"}`}>
          <span className={`w-2 h-2 rounded-full ${qrPng ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
          <span>{statusMsg[status] ?? "Iniciando..."}</span>
          {!qrPng && waitSecs > 5 && <span className="text-gray-300">({waitSecs}s)</span>}
        </div>

        {/* QR o spinner */}
        {qrPng ? (
          <>
            <img
              src={qrPng}
              alt="QR de WhatsApp"
              className="w-60 h-60 mx-auto rounded-xl border-4 border-emerald-50 mb-3"
            />
            <p className="text-xs text-gray-400">El QR expira en ~20 segundos. Se actualiza automáticamente.</p>
            <button
              onClick={fetchStatus}
              className="mt-3 text-xs text-blue-400 hover:text-blue-600 underline"
            >
              Forzar actualización del QR
            </button>
          </>
        ) : (
          <div className="py-10">
            <div className="w-12 h-12 border-3 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" style={{ borderWidth: 3 }} />
            {waitSecs < 15 && <p className="text-sm text-gray-400">Esperando al bot...</p>}
            {waitSecs >= 15 && waitSecs < 45 && (
              <p className="text-sm text-gray-400">
                Esto puede tardar hasta 30 segundos en el primer inicio.
              </p>
            )}
            {waitSecs >= 45 && (
              <div className="space-y-3">
                <p className="text-sm text-amber-600 font-medium">El bot está tardando más de lo normal.</p>
                <p className="text-xs text-gray-400">
                  El servicio puede estar iniciando en Railway. Espera un momento más o recarga la página.
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
      </div>
    </div>
  );
}
