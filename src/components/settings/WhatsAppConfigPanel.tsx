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

interface FbTokenStatus {
  fb_app_id: string;
  has_app_secret: boolean;
  has_page_token: boolean;
  page_name: string | null;
  expires_at: string | null;
  days_left: number | null;
  is_permanent: boolean;
  token_status: "no_token" | "permanent" | "expiring_soon" | "active";
}

type ChannelTab = "whatsapp" | "facebook" | "instagram";

export default function WhatsAppConfigPanel() {
  const [cfg, setCfg]         = useState<WaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChannelTab>("whatsapp");

  // WhatsApp
  const [waToken, setWaToken]   = useState("");
  const [phoneId, setPhoneId]   = useState("");

  // Facebook básico
  const [fbPageId, setFbPageId]     = useState("");
  const [fbPageToken, setFbPageToken] = useState("");

  // Token permanente
  const [fbTokenStatus, setFbTokenStatus] = useState<FbTokenStatus | null>(null);
  const [fbAppId, setFbAppId]         = useState("");
  const [fbAppSecret, setFbAppSecret] = useState("");
  const [fbUserToken, setFbUserToken] = useState("");
  const [exchanging, setExchanging]   = useState(false);

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
    fetch("/api/settings/fb-token").then(r => r.json()).then((d: FbTokenStatus) => {
      setFbTokenStatus(d);
      setFbAppId(d.fb_app_id ?? "");
    });
    setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
  }, []);

  async function handleExchangeToken() {
    if (!fbUserToken) { setResult({ ok: false, msg: "Pega el User Token de Graph API Explorer" }); return; }
    setExchanging(true); setResult(null);
    const body: Record<string, string> = { action: "exchange", fb_user_token: fbUserToken };
    if (fbAppId)     body.fb_app_id     = fbAppId;
    if (fbAppSecret) body.fb_app_secret = fbAppSecret;
    if (fbPageId)    body.fb_page_id    = fbPageId;
    const res = await fetch("/api/settings/fb-token", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await res.json() as { ok: boolean; page_name?: string; page_id?: string; is_permanent?: boolean; pages_found?: {id:string;name:string}[]; error?: string };
    if (d.ok) {
      setResult({ ok: true, msg: `✅ Token ${d.is_permanent ? "permanente" : "de 60 días"} guardado para: ${d.page_name} (${d.page_id})` });
      setFbUserToken(""); setFbAppSecret("");
      fetch("/api/settings/whatsapp").then(r => r.json()).then((c: WaConfig) => setCfg(c));
      fetch("/api/settings/fb-token").then(r => r.json()).then((s: FbTokenStatus) => setFbTokenStatus(s));
    } else {
      setResult({ ok: false, msg: `❌ ${d.error}` });
    }
    setExchanging(false);
  }

  async function handleSaveAppCredentials() {
    if (!fbAppId || !fbAppSecret) { setResult({ ok: false, msg: "App ID y App Secret son requeridos" }); return; }
    setSaving(true); setResult(null);
    const res = await fetch("/api/settings/fb-token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_app", fb_app_id: fbAppId, fb_app_secret: fbAppSecret }),
    });
    const d = await res.json() as { ok: boolean; error?: string };
    if (d.ok) {
      setFbAppSecret(""); // limpiar campo por seguridad
      // Recargar estado para habilitar el Paso 2
      fetch("/api/settings/fb-token").then(r => r.json()).then((s: FbTokenStatus) => setFbTokenStatus(s));
    }
    setResult(d.ok ? { ok: true, msg: "✅ Credenciales guardadas — ahora pega el User Token en el Paso 2" } : { ok: false, msg: `❌ ${d.error}` });
    setSaving(false);
  }

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

  async function handleSaveWa(force = false) {
    setSaving(true); setResult(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", wa_access_token: waToken, wa_phone_number_id: phoneId, force: force ? "true" : "false" }),
    });
    const d = await res.json() as { ok: boolean; phone?: string; name?: string; error?: string; canForce?: boolean; warning?: string };
    if (d.ok) {
      const msg = d.warning ? `⚠️ ${d.warning}` : `✅ WhatsApp conectado: ${d.name ?? "Número de prueba"} (${d.phone ?? phoneId})`;
      setResult({ ok: true, msg });
      fetch("/api/settings/whatsapp").then(r => r.json()).then((c: WaConfig) => setCfg(c));
      setWaToken("");
    } else if (d.canForce) {
      setResult({ ok: false, msg: `❌ ${d.error} — ¿Es un número de prueba? Usa "Guardar sin verificar"` });
    } else {
      setResult({ ok: false, msg: `❌ ${d.error}` });
    }
    setSaving(false);
  }

  async function handleSaveFb() {
    if (!fbPageToken && !cfg?.has_fb_token) { setResult({ ok: false, msg: "Ingresa el Page Access Token" }); return; }
    setSaving(true); setResult(null);
    const body: Record<string, string> = { action: "save_facebook" };
    if (fbPageToken) body.fb_page_token = fbPageToken;
    if (fbPageId)    body.fb_page_id    = fbPageId;
    const res = await fetch("/api/settings/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json() as { ok: boolean; page_name?: string; page_id?: string; error?: string };
    setResult(d.ok ? { ok: true, msg: `✅ Facebook guardado: ${d.page_name ?? "Beach Land Club"} (ID: ${d.page_id ?? fbPageId})` } : { ok: false, msg: `❌ ${d.error}` });
    if (d.ok) {
      setFbPageToken(""); // limpiar campo de token después de guardar
      fetch("/api/settings/whatsapp").then(r => r.json()).then((c: WaConfig) => setCfg(c));
    }
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
            <button onClick={() => handleSaveWa(false)} disabled={saving || !waToken || !phoneId}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
          <button onClick={() => handleSaveWa(true)} disabled={saving || !waToken || !phoneId}
            className="w-full border border-orange-300 text-orange-600 hover:bg-orange-50 text-xs py-2 rounded-xl disabled:opacity-50">
            ⚠️ Guardar sin verificar (número de prueba / test)
          </button>
          {cfg?.provider === "meta" && cfg.has_token && (
            <button onClick={() => handleDisconnect("whatsapp")} className="w-full text-xs text-red-400 hover:text-red-600">Desconectar WhatsApp</button>
          )}
        </div>
      )}

      {/* ── FACEBOOK ── */}
      {activeTab === "facebook" && (
        <div className="space-y-4">

          {/* Estado del token */}
          {fbTokenStatus && (
            <div className={`rounded-xl p-4 border text-sm space-y-1 ${
              fbTokenStatus.token_status === "permanent" ? "bg-emerald-50 border-emerald-200" :
              fbTokenStatus.token_status === "expiring_soon" ? "bg-amber-50 border-amber-300" :
              fbTokenStatus.token_status === "active" ? "bg-blue-50 border-blue-200" :
              "bg-gray-50 border-gray-200"
            }`}>
              {fbTokenStatus.token_status === "permanent" && <p className="font-semibold text-emerald-700">✅ Token permanente activo — nunca expira</p>}
              {fbTokenStatus.token_status === "active" && <p className="font-semibold text-blue-700">🟢 Token activo — expira en {fbTokenStatus.days_left} días</p>}
              {fbTokenStatus.token_status === "expiring_soon" && <p className="font-semibold text-amber-700">⚠️ Token expira pronto — {fbTokenStatus.days_left} días restantes</p>}
              {fbTokenStatus.token_status === "no_token" && <p className="font-semibold text-gray-600">❌ Sin token configurado</p>}
              {fbTokenStatus.page_name && <p className="text-xs text-gray-600">Página: <strong>{fbTokenStatus.page_name}</strong></p>}
              {fbTokenStatus.expires_at && <p className="text-xs text-gray-500">Expira: {new Date(fbTokenStatus.expires_at).toLocaleDateString("es-CO")}</p>}
            </div>
          )}

          {/* ── SECCIÓN 1: Token Permanente (recomendado) ── */}
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">🔑 Token Permanente (Recomendado)</h3>
              <p className="text-xs text-gray-500 mt-1">Genera un token que nunca expira. Requiere App ID y App Secret de tu Meta App.</p>
            </div>

            <details className="text-xs" open={!fbTokenStatus?.has_app_secret}>
              <summary className="cursor-pointer text-indigo-700 font-semibold bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                Paso 1 — Credenciales de la App Meta
              </summary>
              <div className="bg-indigo-50 border border-indigo-200 rounded-b-lg px-3 pb-3 space-y-3 mt-1">
                <p className="text-indigo-700 text-xs mt-2">Ve a <strong>developers.facebook.com → Tu App → Configuración → Básica</strong></p>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">App ID</label>
                  <input type="text" placeholder="Ej: 123456789012345" value={fbAppId} onChange={e => setFbAppId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">App Secret</label>
                  <input type="password" placeholder="Clave secreta de la app" value={fbAppSecret} onChange={e => setFbAppSecret(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <button onClick={handleSaveAppCredentials} disabled={saving || !fbAppId || !fbAppSecret}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg text-xs disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar credenciales de app"}
                </button>
              </div>
            </details>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700">Paso 2 — Pega tu User Token</p>
              <p className="text-xs text-gray-500">Ve a <strong>developers.facebook.com/tools/explorer</strong> → Genera un token de usuario con los permisos requeridos → Pégalo aquí.</p>
              <input type="password" placeholder="EAAGm... (User Access Token de Graph API Explorer)"
                value={fbUserToken} onChange={e => setFbUserToken(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={handleExchangeToken} disabled={exchanging || !fbUserToken || !fbTokenStatus?.has_app_secret}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
                {exchanging ? "Generando token permanente..." : "🔁 Convertir a Token Permanente"}
              </button>
              {!fbTokenStatus?.has_app_secret && (
                <p className="text-xs text-amber-600">⚠️ Guarda primero el App ID y App Secret (Paso 1)</p>
              )}
            </div>
          </div>

          {/* ── SECCIÓN 2: Token Manual (opción rápida) ── */}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-600 font-semibold bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Opción alternativa — Pegar Page Token directamente (expira)
            </summary>
            <div className="bg-white border border-gray-200 rounded-b-xl p-4 space-y-3 mt-1">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Page Access Token</label>
                <input type="password" placeholder={cfg?.has_fb_token ? "Dejar vacío para mantener el actual" : "EAAGm..."}
                  value={fbPageToken} onChange={e => setFbPageToken(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Page ID</label>
                <input type="text" placeholder="Ej: 1017175161475090" value={fbPageId} onChange={e => setFbPageId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <button onClick={handleSaveFb} disabled={saving || (!fbPageToken && !cfg?.has_fb_token)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar token manual"}
              </button>
            </div>
          </details>

          {result && activeTab === "facebook" && (
            <div className={`rounded-lg p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{result.msg}</div>
          )}

          {/* Webhook */}
          {cfg?.has_fb_token && (
            <button
              onClick={async () => {
                setSaving(true); setResult(null);
                const r = await fetch("/api/settings/whatsapp", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "subscribe_facebook_page" }),
                });
                const d = await r.json() as { ok: boolean; message?: string; error?: string };
                setResult(d.ok ? { ok: true, msg: `✅ ${d.message}` } : { ok: false, msg: `❌ ${d.error}` });
                setSaving(false);
              }}
              disabled={saving}
              className="w-full border-2 border-blue-500 text-blue-600 hover:bg-blue-50 font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              📡 Activar recepción de mensajes (suscribir webhook)
            </button>
          )}

          {cfg?.has_fb_token && (
            <button onClick={() => handleDisconnect("facebook")} className="w-full text-xs text-red-400 hover:text-red-600 py-2">
              Desconectar Facebook
            </button>
          )}
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
