"use client";

import { useEffect, useState, useRef } from "react";

interface QRScreenProps {
  onConnected: (phone: string) => void;
}

type Status = "disconnected" | "qr" | "connecting" | "connected";

interface StatusResponse {
  status: Status;
  qrPng?: string;
  phone?: string;
  updatedAt: number;
}

export default function QRScreen({ onConnected }: QRScreenProps) {
  const [status, setStatus]   = useState<Status>("disconnected");
  const [qrPng, setQrPng]     = useState<string | null>(null);
  const [longWait, setLongWait] = useState(false);
  const [qrAge, setQrAge]     = useState(0); // segundos desde que llegó el QR

  // Guardamos el último updatedAt para no redibujar el QR si no cambió
  const lastUpdatedAt = useRef<number>(0);
  const firstPollAt   = useRef(Date.now());
  const qrReceivedAt  = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/connection/status");
        if (!res.ok) return;
        const data: StatusResponse = await res.json();
        if (!active) return;

        setStatus(data.status);

        // Solo actualizar QR si el updatedAt cambió (nuevo QR del bot)
        if (data.status === "qr" && data.qrPng && data.updatedAt !== lastUpdatedAt.current) {
          lastUpdatedAt.current = data.updatedAt;
          qrReceivedAt.current  = Date.now();
          setQrPng(data.qrPng);
          setQrAge(0);
        }

        if (data.status === "connected" && data.phone) {
          onConnected(data.phone);
          return;
        }
      } catch {}

      if (Date.now() - firstPollAt.current > 15000 && status === "disconnected") {
        setLongWait(true);
      }

      // Polling cada 3s para el QR (da tiempo de escanear sin parpadeo)
      if (active) setTimeout(poll, 3000);
    }

    poll();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador de edad del QR (WhatsApp invalida QRs ~20s)
  useEffect(() => {
    if (!qrReceivedAt.current) return;
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - (qrReceivedAt.current ?? Date.now())) / 1000);
      setQrAge(secs);
    }, 1000);
    return () => clearInterval(interval);
  }, [qrPng]);

  const qrExpiringSoon = qrAge > 15;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-gray-800 mb-1">Conectar WhatsApp</h1>
        <p className="text-sm text-gray-400 mb-6">
          Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
        </p>

        {status === "qr" && qrPng ? (
          <>
            <div className={`relative inline-block rounded-xl overflow-hidden ${qrExpiringSoon ? "opacity-40" : ""}`}>
              <img
                src={qrPng}
                alt="QR de WhatsApp"
                className="w-64 h-64"
              />
              {qrExpiringSoon && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-amber-500 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Actualizando QR...</p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-amber-500 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Esperando escaneo...
            </div>
            {qrAge > 0 && !qrExpiringSoon && (
              <p className="text-xs text-gray-300 mt-1">QR válido ~{Math.max(0, 20 - qrAge)}s</p>
            )}
          </>
        ) : status === "connecting" ? (
          <div className="flex items-center justify-center gap-2 text-blue-500 text-sm py-16">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Conectando...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-400">Generando código QR...</p>
            {longWait && (
              <p className="text-xs text-red-400 mt-3">
                El bot tarda. Si estás en Railway, verifica que el servicio esté activo.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
