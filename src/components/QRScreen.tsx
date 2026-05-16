"use client";

import { useEffect, useState, useCallback } from "react";

interface QRScreenProps {
  onConnected: (phone: string) => void;
}

export default function QRScreen({ onConnected }: QRScreenProps) {
  const [qrPng, setQrPng]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [connected, setConnected] = useState(false);

  // Obtener QR una sola vez (no loop)
  const fetchQR = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/connection/status");
      const data = await res.json();
      if (data.status === "connected" && data.phone) {
        onConnected(data.phone);
        setConnected(true);
        return;
      }
      if (data.qrPng) setQrPng(data.qrPng);
    } catch {}
    setLoading(false);
  }, [onConnected]);

  useEffect(() => { fetchQR(); }, [fetchQR]);

  // Poll SOLO para detectar cuando se conecta (no actualiza el QR)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res  = await fetch("/api/connection/status");
        const data = await res.json();
        if (data.status === "connected" && data.phone) {
          onConnected(data.phone);
          setConnected(true);
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [onConnected]);

  if (connected) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-gray-800 mb-1">Conectar WhatsApp</h1>
        <p className="text-sm text-gray-400 mb-6">
          Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
        </p>

        {loading && !qrPng ? (
          <div className="py-16">
            <div className="w-10 h-10 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400 mt-4">Generando QR...</p>
          </div>
        ) : qrPng ? (
          <>
            {/* QR ESTÁTICO — no se mueve mientras escanes */}
            <img
              src={qrPng}
              alt="QR de WhatsApp"
              className="w-64 h-64 mx-auto rounded-xl border-4 border-emerald-50"
            />
            <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm mt-4">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Escanea el código con tu cámara
            </div>
            <p className="text-xs text-gray-300 mt-2">
              El QR es válido ~20 segundos
            </p>
            <button
              onClick={fetchQR}
              className="mt-4 text-xs text-blue-400 hover:text-blue-600 underline"
            >
              ¿Expiró? Haz click para obtener un nuevo QR
            </button>
          </>
        ) : (
          <div className="py-12">
            <p className="text-gray-400 text-sm mb-4">No se pudo generar el QR.</p>
            <button
              onClick={fetchQR}
              className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
