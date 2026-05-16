"use client";

import { useEffect, useState } from "react";

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
  const [status, setStatus] = useState<Status>("disconnected");
  const [qrPng, setQrPng] = useState<string | null>(null);
  const [firstPollAt] = useState(() => Date.now());
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/connection/status");
        if (!res.ok) return;
        const data: StatusResponse = await res.json();

        if (!active) return;

        setStatus(data.status);

        if (data.status === "qr" && data.qrPng) {
          setQrPng(data.qrPng);
        }

        if (data.status === "connected" && data.phone) {
          onConnected(data.phone);
          return;
        }
      } catch {}

      if (Date.now() - firstPollAt > 10000 && status === "disconnected") {
        setLongWait(true);
      }

      if (active) setTimeout(poll, 2000);
    }

    poll();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-gray-800 mb-2">Conectar número</h1>
        <p className="text-sm text-gray-500 mb-6">
          Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo
        </p>

        {status === "qr" && qrPng ? (
          <>
            <img
              src={qrPng}
              alt="QR de WhatsApp"
              className="mx-auto w-64 h-64 rounded-xl mb-4"
            />
            <div className="flex items-center justify-center gap-2 text-amber-500 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Esperando escaneo...
            </div>
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
            {longWait && (
              <p className="text-xs text-red-400 mt-2">
                El bot tarda en responder. Asegúrate de que{" "}
                <code className="bg-gray-100 px-1 rounded">npm run start:bot</code> esté corriendo.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
