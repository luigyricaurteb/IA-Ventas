"use client";
import { useState, useEffect } from "react";

interface WaConfig {
  provider: string;
  wa_phone_number_id: string;
  wa_phone_display: string;
  wa_verified_name: string;
  has_token: boolean;
  wa_access_token_preview: string;
  fb_page_id: string;
  fb_page_name: string;
  ig_account_id: string;
  ig_username: string;
  has_fb_token: boolean;
}

type ChannelTab = "whatsapp" | "facebook" | "instagram";

export default function WhatsAppConfigPanel() {
  const [cfg, setCfg]         = useState<WaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChannelTab>("whatsapp");

  // WhatsApp
  const [waToken, setWaToken]   = useState("");
  const [phoneId, setPhoneId]   = useState("");

  // Facebook
  const [fbPageId, setFbPageId]     = useState("");
  const [fbPageToken, setFbPageToken] = useState("");

  // Instagram (se configura junto a Facebook)
  const [igAccountId, setIgAccountId] = useState("");
  const [igUsername, setIgUsername]   = useState("");

  const [saving, setSaving]     = useState(false);
  const [result, setResult]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; phone?: string; name?: string; error?: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    fetch("/api/settings/whatsapp").then(r => r.json()).then((d: WaConfig) => {
      setCfg(d);
      setPhoneId(d.wa_phone_number_id ?? "");
      setFbPageId(d.fb_page_id ?? "");
      setIgAccountId(d.ig_account_id ?? "");
      setIgUsername(d.ig_username ?? "");
      setLoading(false);
    });
    setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
  }, []);

  async function handleVerifyWa() {
    if (!waToken || !phoneId) { setResult({ ok: false, msg: "Completa el Token y Phone Number ID" }); return; }
    setVerifying(true); setVerifyResult(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", wa_access_token: waToken, wa_phone_number_id: phoneId }),
    });
    const d = await res.json() as { ok: boolean; phone?: string; name?: string; error?: string };
    setVerifyResult(d);
    setVerifying(false);
  }

  async function handleSaveWa() {
    setSaving(true); setResult(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", wa_access_token: waToken, wa_phone_number_id: phoneId }),
    });
    const d = await res.json() as { ok: boolean; phone?: string; name?: string; error?: string };
    if (d.ok) {
      setResult({ ok: true, msg: `✅ WhatsApp conectado: ${d.name} (${d.phone})` });
      fetch("/api/settings/whatsapp").then(r => r.json()).then((c: WaConfig) => setCfg(c));
      setWaToken("");
    } else setResult({ ok: false, msg: `❌ ${d.error}` });
    setSaving(false);
  }

  async function handleSaveFb() {
    if (!fbPageToken) { setResult({ ok: false, msg: "Ingresa el Page Access Token" }); return; }
    setSaving(true); setResult(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_facebook", fb_page_token: fbPageToken }),
    });
    const d = await res.json() as { ok: boolean; page_name?: string; page_id?: string; error?: string };
    setResult(d.ok ? { ok: true, msg: `✅ Facebook conectado: ${d.page_name} (ID: ${d.page_id})` } : { ok: false, msg: `❌ ${d.error}` });
    if (d.ok) fetch("/api/settings/whatsapp").then(r => r.json()).then((c: WaConfig) => setCfg(c));
    setSaving(false);
  }

  async function handleSaveIg() {
    if (!igAccountId) { setResult({ ok: false, msg: "Completa el Instagram Account ID" }); return; }
    setSaving(true); setResult(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_instagram", ig_account_id: igAccountId, ig_username: igUsername }),
    });
    const d = await res.json() as { ok: boolean; error?: string };
    setResult(d.ok ? { ok: true, msg: "✅ Instagram conectado" } : { ok: false, msg: `❌ ${d.error}` });
    if (d.ok) fetch("/api/settings/whatsapp").then(r => r.json()).then((c: WaConfig) => setCfg(c));
    setSaving(false);
  }

  async function handleDisconnect(channel: string) {
    if (!confirm(`¿Desconectar ${channel}?`)) return;
    await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: `disconnect_${channel}` }),
    });
    fetch("/api/settings/whatsapp").then(r => r.json()).then((d: WaConfig) => setCfg(d));
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" /></div>;

  const tabs: { id: ChannelTab; icon: string; label: string }[] = [
    { id: "whatsapp",  icon: "📱", label: "WhatsApp" },
    { id: "facebook",  icon: "📘", label: "Facebook" },
    { id: "instagram", icon: "📸", label: "Instagram" },
  ];

  return (
    <div className="space-y-4">

      {/* Tabs de canal */}
      <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setResult(null); setVerifyResult(null); }}
            className={`flex-1 py-2.5 font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === t.id ? "bg-emerald-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Estado de canales */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { ch: "whatsapp", icon: "📱", label: cfg?.wa_phone_display ? `+${cfg.wa_phone_display}` : "No configurado", ok: cfg?.provider === "meta" && cfg?.has_token },
          { ch: "facebook", icon: "📘", label: cfg?.fb_page_name || cfg?.fb_page_id || "No configurado", ok: !!cfg?.fb_page_id && cfg?.has_fb_token },
          { ch: "instagram", icon: "📸", label: cfg?.ig_username ? `@${cfg.ig_username}` : "No configurado", ok: !!cfg?.ig_account_id },
        ].map(({ ch, icon, label, ok }) => (
          <div key={ch} className={`rounded-xl p-3 border text-center ${ok ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
            <div className="text-2xl mb-1">{ok ? "✅" : icon}</div>
            <p className={`text-xs font-medium truncate ${ok ? "text-emerald-700" : "text-gray-500"}`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Webhook URL (común para los 3 canales) */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-800">URL Webhook (usar para los 3 canales)</p>
        <div className="bg-white border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <code className="text-xs text-gray-700 break-all">{webhookUrl}</code>
          <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="text-xs text-blue-600 font-medium shrink-0">Copiar</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-700">Token verificación:</span>
          <code className="text-xs bg-white border border-blue-200 rounded px-2 py-0.5">agente-dmc-webhook-2026</code>
          <button onClick={() => navigator.clipboard.writeText("agente-dmc-webhook-2026")} className="text-xs text-blue-600 font-medium">Copiar</button>
        </div>
      </div>

      {/* ── WHATSAPP ── */}
      {activeTab === "whatsapp" && (
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">📱 WhatsApp Cloud API</h3>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Token de Acceso <span className="text-red-500">*</span></label>
            <input type="password" placeholder="EAAG..." value={waToken} onChange={e => { setWaToken(e.target.value); setVerifyResult(null); setResult(null); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <p className="text-xs text-gray-400 mt-1">Meta → WhatsApp → Paso 1 → Token de acceso</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Phone Number ID <span className="text-red-500">*</span></label>
            <input type="text" placeholder="123456789012345" value={phoneId} onChange={e => { setPhoneId(e.target.value); setVerifyResult(null); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          {verifyResult && (
            <div className={`rounded-lg p-3 text-sm ${verifyResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {verifyResult.ok ? `✅ ${verifyResult.name} (+${verifyResult.phone})` : `❌ ${verifyResult.error}`}
            </div>
          )}
          {result && activeTab === "whatsapp" && (
            <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{result.msg}</div>
          )}
          <div className="flex gap-2">
            <button onClick={handleVerifyWa} disabled={verifying || !waToken || !phoneId}
              className="flex-1 border border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {verifying ? "Verificando..." : "Verificar"}
            </button>
            <button onClick={handleSaveWa} disabled={saving || !waToken || !phoneId}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
          {cfg?.provider === "meta" && cfg.has_token && (
            <button onClick={() => handleDisconnect("whatsapp")} className="w-full text-xs text-red-400 hover:text-red-600">Desconectar WhatsApp</button>
          )}
        </div>
      )}

      {/* ── FACEBOOK ── */}
      {activeTab === "facebook" && (
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">📘 Facebook Messenger</h3>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Pasos previos en Meta:</p>
            <p>1. Tu app → Agregar producto → <strong>Messenger</strong></p>
            <p>2. Conecta tu Página de Facebook</p>
            <p>3. Copia el Page Access Token</p>
            <p>4. Configura el webhook con la URL de arriba → suscríbete a <strong>messages</strong></p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Page Access Token <span className="text-red-500">*</span></label>
            <input type="password" placeholder="EAAGm..." value={fbPageToken} onChange={e => setFbPageToken(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          {result && activeTab === "facebook" && (
            <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{result.msg}</div>
          )}
          <button onClick={handleSaveFb} disabled={saving || !fbPageId || !fbPageToken}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar Facebook"}
          </button>
        </div>
      )}

      {/* ── INSTAGRAM ── */}
      {activeTab === "instagram" && (
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">📸 Instagram Direct Messages</h3>
          <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-xs text-pink-800 space-y-1">
            <p className="font-semibold">Requisitos:</p>
            <p>• Cuenta de <strong>Instagram Business</strong> o Creator</p>
            <p>• Conectada a tu Página de Facebook</p>
            <p>1. Tu app → Agregar producto → <strong>Instagram</strong></p>
            <p>2. Conecta la cuenta de Instagram</p>
            <p>3. Copia el Instagram Account ID</p>
            <p>4. El webhook ya está configurado (comparte con Facebook)</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Instagram Account ID <span className="text-red-500">*</span></label>
            <input type="text" placeholder="17841234567890" value={igAccountId} onChange={e => setIgAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            <p className="text-xs text-gray-400 mt-1">Meta → Instagram → Configuración → ID de cuenta</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Usuario de Instagram</label>
            <input type="text" placeholder="@beachlan.ctg" value={igUsername} onChange={e => setIgUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          </div>
          {result && activeTab === "instagram" && (
            <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{result.msg}</div>
          )}
          <button onClick={handleSaveIg} disabled={saving || !igAccountId}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar Instagram"}
          </button>
        </div>
      )}

      <div className="bg-gray-50 border rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-600 mb-1">Costos por canal:</p>
        <p>📱 WhatsApp: <strong>Gratis</strong> cuando el cliente escribe primero</p>
        <p>📘 Facebook Messenger: <strong>Gratis</strong> (sin límite)</p>
        <p>📸 Instagram DMs: <strong>Gratis</strong> (sin límite)</p>
      </div>
    </div>
  );
}
