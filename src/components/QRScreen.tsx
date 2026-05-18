"use client";

import { useEffect, useState, useRef } from "react";

interface QRScreenProps {
  onConnected: (phone: string) => void;
}

export default function QRScreen({ onConnected }: QRScreenProps) {
  const [qrPng, setQrPng]           = useState<string | null>(null);
  const [botStatus, setBotStatus]   = useState<string>("disconnected");
  const [waitSecs, setWaitSecs]     = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Pairing code
  const [mode, setMode]             = useState<"qr" | "phone">("qr");
  const [phoneInput, setPhoneInput] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingCode, setPairingCode]       = useState<string | null>(null);
  const [pairingError, setPairingError]     = useState<string | null>(null);
  const pairingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (data.qrPng && data.updatedAt && data.updatedAt !== lastUpdatedAt.current) {
        lastUpdatedAt.current = data.updatedAt;
        if (!silent) setRefreshing(true);
        setQrPng(data.qrPng);
        setTimeout(() => setRefreshing(false), 300);
      }
    } catch {}
  }

  async function handleRestart() {
    setRestarting(true);
    setQrPng(null);
    setWaitSecs(0);
    setPairingCode(null);
    setPairingError(null);
    try { await fetch("/api/connection/restart", { method: "POST" }); } catch {}
    setTimeout(() => setRestarting(false), 2000);
  }

  async function handleRequestPairingCode() {
    const clean = phoneInput.replace(/\D/g, "");
    if (clean.length < 10) {
      setPairingError("Ingresa el número con código de país (ej: 573006150725)");
      return;
    }
    setPairingLoading(true);
    setPairingCode(null);
    setPairingError(null);

    // 1. Asegurarse de que el bot está corriendo (reiniciar si no hay QR)
    if (!qrPng) {
      try { await fetch("/api/connection/restart", { method: "POST" }); } catch {}
      await new Promise(r => setTimeout(r, 4000)); // esperar a que el bot arranque
    }

    // 2. Solicitar pairing code
    try {
      const res = await fetch("/api/connection/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clean }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!d.ok) {
        setPairingError(d.error ?? "Error desconocido");
        setPairingLoading(false);
        return;
      }
    } catch {
      setPairingError("Error de red");
      setPairingLoading(false);
      return;
    }

    // 3. Polling para obtener el código (máx 30s)
    let tries = 0;
    if (pairingPollRef.current) clearInterval(pairingPollRef.current);
    pairingPollRef.current = setInterval(async () => {
      tries++;
      if (tries > 30) {
        clearInterval(pairingPollRef.current!);
        setPairingError("El código tardó demasiado. Intenta de nuevo.");
        setPairingLoading(false);
        return;
      }
      try {
        const r = await fetch("/api/connection/pairing");
        const d = await r.json() as { ready?: boolean; code?: string; error?: string };
        if (d.ready && d.code) {
          clearInterval(pairingPollRef.current!);
          setPairingCode(d.code);
          setPairingLoading(false);
        } else if (d.error) {
          clearInterval(pairingPollRef.current!);
          setPairingError(d.error);
          setPairingLoading(false);
        }
      } catch {}
    }, 1000);
  }

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(() => fetchStatus(true), 2000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador de espera — resetea al aparecer QR
  useEffect(() => {
    if (qrPng) { setWaitSecs(0); return; }
    const t = setInterval(() => setWaitSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [qrPng]);

  useEffect(() => {
    return () => { if (pairingPollRef.current) clearInterval(pairingPollRef.current); };
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
            Elige cómo quieres vincular tu número
          </p>
        </div>

        {/* Selector de método */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-5 text-sm">
          <button
            onClick={() => { setMode("qr"); setPairingCode(null); setPairingError(null); }}
            className={`flex-1 py-2 font-medium transition-colors ${mode === "qr" ? "bg-emerald-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            📷 Código QR
          </button>
          <button
            onClick={() => setMode("phone")}
            className={`flex-1 py-2 font-medium transition-colors ${mode === "phone" ? "bg-emerald-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            📞 Código de teléfono
          </button>
        </div>

        {/* ── MODO QR ─────────────────────────────────────────────────── */}
        {mode === "qr" && (
          <>
            <p className="text-xs text-gray-400 mb-3">
              Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>

            <div className={`flex items-center justify-center gap-2 text-xs mb-4 font-medium ${qrPng ? "text-emerald-600" : "text-amber-500"}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${qrPng ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
              {qrPng
                ? (refreshing ? "Actualizando QR..." : "QR listo — escanea ahora")
                : restarting ? "Reiniciando..." : "Generando QR..."}
            </div>

            {qrPng ? (
              <div className="relative inline-block">
                <img src={qrPng} alt="QR WhatsApp" className={`w-64 h-64 rounded-xl border-4 border-emerald-50 mx-auto transition-opacity duration-300 ${refreshing ? "opacity-60" : "opacity-100"}`} />
                {refreshing && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/40">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 space-y-3">
                <div className="w-12 h-12 rounded-full animate-spin mx-auto"
                  style={{ border: "3px solid #e5e7eb", borderTopColor: restarting ? "#f59e0b" : "#10b981" }} />
                {waitSecs >= 10 && !restarting && (
                  <>
                    <button
                      onClick={handleRestart}
                      className="w-full bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 active:scale-95 transition-all"
                    >
                      🔄 Solicitar código QR
                    </button>
                    <p className="text-xs text-gray-400">
                      Si no aparece el QR, usa el método de código de teléfono →
                    </p>
                  </>
                )}
              </div>
            )}

            {qrPng && (
              <p className="text-xs text-gray-400 mt-3">
                El código se renueva automáticamente
              </p>
            )}
          </>
        )}

        {/* ── MODO CÓDIGO DE TELÉFONO ──────────────────────────────────── */}
        {mode === "phone" && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Ingresa tu número de WhatsApp con código de país.<br />
              Recibirás un código de 8 letras para ingresar en la app.
            </p>

            <div>
              <input
                type="tel"
                placeholder="Ej: 573006150725"
                value={phoneInput}
                onChange={e => { setPhoneInput(e.target.value); setPairingError(null); }}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-center tracking-wide focus:outline-none focus:ring-2 focus:ring-emerald-400"
                disabled={pairingLoading}
              />
              <p className="text-xs text-gray-400 mt-1">Incluye el código de país sin el +</p>
            </div>

            {!pairingCode && (
              <button
                onClick={handleRequestPairingCode}
                disabled={pairingLoading || phoneInput.replace(/\D/g, "").length < 10}
                className="w-full bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
              >
                {pairingLoading ? "⏳ Generando código..." : "📲 Obtener código"}
              </button>
            )}

            {pairingError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600">{pairingError}</p>
                <button
                  onClick={() => { setPairingError(null); setPairingCode(null); }}
                  className="text-xs text-red-400 mt-1 underline"
                >
                  Intentar de nuevo
                </button>
              </div>
            )}

            {pairingCode && (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 space-y-3">
                <p className="text-sm font-semibold text-emerald-800">Tu código de vinculación:</p>
                <div className="text-4xl font-bold tracking-widest text-emerald-700 font-mono">
                  {pairingCode}
                </div>
                <div className="text-xs text-emerald-600 space-y-1 text-left bg-white rounded-xl p-3">
                  <p className="font-semibold">Cómo usarlo:</p>
                  <p>1. Abre WhatsApp en tu celular</p>
                  <p>2. Ve a <strong>Dispositivos vinculados</strong></p>
                  <p>3. Toca <strong>Vincular con número de teléfono</strong></p>
                  <p>4. Ingresa el código de arriba</p>
                </div>
                <button
                  onClick={() => { setPairingCode(null); setPairingError(null); }}
                  className="text-xs text-emerald-600 underline"
                >
                  Solicitar nuevo código
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
