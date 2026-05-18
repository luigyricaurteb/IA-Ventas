"use client";
import { useState, useEffect } from "react";

interface WaConfig {
  provider: "baileys" | "meta";
  wa_phone_number_id: string;
  wa_phone_display: string;
  wa_verified_name: string;
  has_token: boolean;
  wa_access_token_preview: string;
}

export default function WhatsAppConfigPanel() {
  const [cfg, setCfg]         = useState<WaConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulario Meta
  const [token, setToken]       = useState("");
  const [phoneId, setPhoneId]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; phone?: string; name?: string; error?: string } | null>(null);

  // Webhook info
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    fetch("/api/settings/whatsapp").then(r => r.json()).then((d: WaConfig) => {
      setCfg(d);
      setPhoneId(d.wa_phone_number_id ?? "");
      setLoading(false);
    });
    setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
  }, []);

  async function handleVerify() {
    if (!token || !phoneId) { setResult({ ok: false, msg: "Completa el Token y el Phone Number ID" }); return; }
    setVerifying(true); setVerifyResult(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", wa_access_token: token, wa_phone_number_id: phoneId }),
    });
    const d = await res.json() as { ok: boolean; phone?: string; name?: string; error?: string };
    setVerifyResult(d);
    setVerifying(false);
  }

  async function handleSave() {
    if (!token || !phoneId) { setResult({ ok: false, msg: "Completa todos los campos" }); return; }
    setSaving(true); setResult(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", wa_access_token: token, wa_phone_number_id: phoneId }),
    });
    const d = await res.json() as { ok: boolean; phone?: string; name?: string; error?: string };
    if (d.ok) {
      setResult({ ok: true, msg: `✅ Conectado: ${d.name} (${d.phone})` });
      fetch("/api/settings/whatsapp").then(r => r.json()).then((cfg: WaConfig) => setCfg(cfg));
      setToken("");
    } else {
      setResult({ ok: false, msg: `❌ ${d.error}` });
    }
    setSaving(false);
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar la API de Meta? El bot dejará de recibir mensajes.")) return;
    await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    fetch("/api/settings/whatsapp").then(r => r.json()).then((d: WaConfig) => setCfg(d));
    setResult(null);
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">

      {/* Estado actual */}
      <div className={`rounded-xl p-5 border flex items-center gap-4 ${
        cfg?.provider === "meta" ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"
      }`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0 ${
          cfg?.provider === "meta" ? "bg-emerald-100" : "bg-gray-200"
        }`}>
          {cfg?.provider === "meta" ? "✅" : "📵"}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${cfg?.provider === "meta" ? "text-emerald-800" : "text-gray-700"}`}>
            {cfg?.provider === "meta" ? "WhatsApp Cloud API conectada" : "Sin configurar — API de Meta"}
          </p>
          {cfg?.provider === "meta" && (
            <div className="text-sm text-gray-600 mt-0.5 space-y-0.5">
              {cfg.wa_verified_name && <p>Empresa: <strong>{cfg.wa_verified_name}</strong></p>}
              {cfg.wa_phone_display && <p>Número: <strong>+{cfg.wa_phone_display}</strong></p>}
              <p className="text-xs text-gray-400">Token: {cfg.wa_access_token_preview}</p>
            </div>
          )}
          {cfg?.provider !== "meta" && (
            <p className="text-sm text-gray-500 mt-0.5">Configura la API oficial de Meta para recibir mensajes sin riesgo de bloqueo</p>
          )}
        </div>
        {cfg?.provider === "meta" && (
          <button onClick={handleDisconnect} className="shrink-0 bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-medium">
            Desconectar
          </button>
        )}
      </div>

      {/* Formulario de configuración */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          ☁️ Configurar WhatsApp Cloud API
        </h3>

        {/* Paso 1: Webhook URL */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800">Paso 1 — Configura el Webhook en Meta</p>
          <p className="text-xs text-blue-700">En tu app de Meta → WhatsApp → Configuración → Webhooks, ingresa:</p>
          <div className="bg-white border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <code className="text-xs text-gray-700 break-all">{webhookUrl || "https://tu-app.railway.app/api/whatsapp/webhook"}</code>
            <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="text-xs text-blue-600 hover:text-blue-800 shrink-0 font-medium">
              Copiar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-700">Token de verificación:</span>
            <code className="text-xs bg-white border border-blue-200 rounded px-2 py-0.5">agente-dmc-webhook-2026</code>
            <button onClick={() => navigator.clipboard.writeText("agente-dmc-webhook-2026")} className="text-xs text-blue-600 font-medium">Copiar</button>
          </div>
          <p className="text-xs text-blue-600">Suscríbete al campo: <strong>messages</strong></p>
        </div>

        {/* Paso 2: Credenciales */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Paso 2 — Ingresa tus credenciales</p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Token de Acceso Permanente <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              placeholder="EAAG..."
              value={token}
              onChange={e => { setToken(e.target.value); setVerifyResult(null); setResult(null); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              Meta → Tu App → WhatsApp → Configuración de la API → Token de acceso
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Phone Number ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="123456789012345"
              value={phoneId}
              onChange={e => { setPhoneId(e.target.value); setVerifyResult(null); setResult(null); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              Meta → Tu App → WhatsApp → Números de teléfono → ID del número
            </p>
          </div>
        </div>

        {/* Resultado de verificación */}
        {verifyResult && (
          <div className={`rounded-lg p-3 text-sm ${verifyResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {verifyResult.ok
              ? `✅ Conexión verificada — ${verifyResult.name} (+${verifyResult.phone})`
              : `❌ ${verifyResult.error}`}
          </div>
        )}

        {result && (
          <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {result.msg}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleVerify}
            disabled={verifying || !token || !phoneId}
            className="flex-1 border border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 transition-colors"
          >
            {verifying ? "Verificando..." : "Verificar conexión"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !token || !phoneId || (!!verifyResult && !verifyResult.ok)}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 transition-colors"
          >
            {saving ? "Guardando..." : "Guardar y conectar"}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-gray-50 border rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-600 mb-2">¿Cómo funciona?</p>
        <p>• Los mensajes llegan vía webhook a tu servidor Railway (sin QR, sin proceso background)</p>
        <p>• El bot responde usando la API oficial — cero riesgo de bloqueo</p>
        <p>• Mensajes de clientes hacia ti: <strong>GRATIS</strong></p>
        <p>• Campañas de marketing que tú inicies: ~$51 COP por mensaje</p>
        <p>• El token temporal dura 24h — crea un token permanente en Meta Business Manager</p>
      </div>
    </div>
  );
}
