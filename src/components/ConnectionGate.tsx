"use client";
import { useState, useEffect, useCallback } from "react";
import QRScreen from "./QRScreen";
import DashboardHeader from "./DashboardHeader";
import Sidebar from "./layout/Sidebar";
import type { Module } from "./layout/Sidebar";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import KanbanBoard from "./crm/KanbanBoard";
import ProductsModule from "./products/ProductsModule";
import CampaignsModule from "./campaigns/CampaignsModule";
import SettingsModule from "./settings/SettingsModule";
import DocumentsModule from "./documents/DocumentsModule";
import CalendarModule from "./calendar/CalendarModule";
import SuppliersModule from "./suppliers/SuppliersModule";
import AccountingModule from "./accounting/AccountingModule";
import AnalyticsModule from "./analytics/AnalyticsModule";
import JulietaAlertsPanel from "./chat/JulietaAlertsPanel";
import MasterDashboard from "./master/MasterDashboard";
import HelpModule from "./help/HelpModule";
import FlowBuilder from "./chat/FlowBuilder";
import SubscriptionModule from "./subscription/SubscriptionModule";
import TicketsModule from "./tickets/TicketsModule";
import AutopilotModule from "./autopilot/AutopilotModule";
import { getAllowedModules, canAccess } from "@/lib/auth-client";

interface Conversation {
  id: number; phone: string; name: string | null;
  mode: "AI" | "HUMAN"; last_message_at: number | null;
  last_message_preview: string | null;
}

export interface CurrentUser {
  id: number | string; username: string; name: string;
  role?: "master"; permissions?: Record<string, boolean>;
  is_admin?: boolean; company?: string; isMaster?: boolean;
}

export default function ConnectionGate() {
  const [connected, setConnected]         = useState(false);
  const [phone, setPhone]                 = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId]       = useState<number | null>(null);
  const [initialChecked, setInitialChecked] = useState(false);
  const [activeModule, setActiveModule]   = useState<Module>("chat");
  const [currentUser, setCurrentUser]     = useState<CurrentUser | null>(null);
  const [scanning, setScanning]           = useState(false);
  const [scanResult, setScanResult]       = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen]     = useState(false); // móvil drawer

  useEffect(() => {
    fetch("/api/auth/me").then(r => {
      if (r.status === 401) { window.location.href = "/login"; return null; }
      return r.json();
    }).then(d => {
      if (d?.user) setCurrentUser(d.user);
    }).catch(() => {});

    fetch("/api/connection/status").then(r => r.json()).then(data => {
      if (data.status === "connected" && data.phone) { setPhone(data.phone); setConnected(true); }
      setInitialChecked(true);
    }).catch(() => setInitialChecked(true));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const allowed = getAllowedModules(currentUser.permissions, currentUser.isMaster || currentUser.role === "master");
    if (allowed.length > 0 && !allowed.includes(activeModule as Module)) {
      setActiveModule(allowed[0] as Module);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      setConversations((await res.json()).conversations);
    } catch {}
  }, []);

  // Cargar conversaciones siempre (con o sin WhatsApp conectado) y hacer polling
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 3000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  function handleConnected(p: string) { setPhone(p); setConnected(true); }
  function handleDisconnect() { setConnected(false); setPhone(null); setSelectedId(null); setConversations([]); }
  function handleModeChange(id: number, mode: "AI" | "HUMAN") {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, mode } : c));
  }
  function handleDelete(id: number) {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  async function handleScan() {
    setScanning(true); setScanResult(null);
    const res = await fetch("/api/conversations/scan", { method: "POST" });
    const d   = await res.json();
    setScanResult(`✓ ${d.scanned} de ${d.total} conversaciones escaneadas`);
    setScanning(false);
    setTimeout(() => setScanResult(null), 5000);
  }
  async function handleSyncNames() {
    setScanning(true); setScanResult(null);
    // Primero limpiar LIDs, luego sincronizar nombres
    await fetch("/api/conversations/cleanup-lids", { method: "POST" });
    const res = await fetch("/api/conversations/sync-names", { method: "POST" });
    const d   = await res.json() as { conversations_updated?: number; contacts_created?: number };
    setScanResult(`✓ ${d.conversations_updated ?? 0} nombres actualizados, ${d.contacts_created ?? 0} contactos creados`);
    setScanning(false);
    fetchConversations();
    setTimeout(() => setScanResult(null), 6000);
  }

  async function handleCleanupLids() {
    setScanning(true); setScanResult(null);
    const res = await fetch("/api/conversations/cleanup-lids", { method: "POST" });
    const d   = await res.json() as { removed_empty?: number; lids_found?: number };
    setScanResult(`✓ ${d.removed_empty ?? 0} chats vacíos corregidos (historial preservado)`);
    setScanning(false);
    fetchConversations();
    setTimeout(() => setScanResult(null), 5000);
  }

  if (!initialChecked) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900"><div className="w-8 h-8 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" /></div>;
  }

  // El dashboard es siempre accesible — WhatsApp se configura en el módulo de Chat o en Ajustes

  const selectedConv  = conversations.find(c => c.id === selectedId) ?? null;
  const perms         = currentUser?.permissions ?? {};
  const isMaster      = (currentUser?.isMaster ?? false) || currentUser?.role === "master";
  const isAdmin       = currentUser?.is_admin ?? false;
  const allowedMods   = getAllowedModules(perms, isMaster, isAdmin);

  // En móvil, cuando hay una conversación seleccionada mostramos el panel, no la lista
  const showChatPanel  = selectedConv !== null;
  const showChatList   = !showChatPanel || selectedId === null;

  return (
    <div className="flex h-screen overflow-hidden bg-white">

      {/* ── Sidebar (desktop fijo + móvil drawer) ──────────────────────── */}
      <Sidebar
        active={activeModule}
        onChange={m => { setActiveModule(m); setSidebarOpen(false); }}
        allowedModules={allowedMods}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        onMobileOpen={() => setSidebarOpen(true)}
      />

      {/* ── Contenido principal ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">

        {/* Header — en móvil tiene botón hamburguesa */}
        <DashboardHeader
          phone={phone}
          onDisconnect={handleDisconnect}
          currentUser={currentUser}
          onLogout={handleLogout}
          onMenuOpen={() => setSidebarOpen(true)}
        />

        {/* Área de contenido — padding-bottom en móvil para bottom nav */}
        <div className="flex flex-1 overflow-hidden min-h-0 pb-14 md:pb-0">

          {activeModule === "master" && isMaster && <MasterDashboard onLogout={handleLogout} />}

          {activeModule === "chat" && canAccess(perms, "chat", isMaster) && (
            connected ? (
              <div className="flex flex-1 overflow-hidden min-w-0">

                {/* Lista de conversaciones — oculta en móvil si hay conv. seleccionada */}
                <div className={`
                  ${showChatPanel ? "hidden md:flex" : "flex"}
                  w-full md:w-72 shrink-0 border-r border-gray-200 bg-white flex-col
                `}>
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Conversaciones
                      {conversations.length > 0 && (
                        <span className="ml-1.5 bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px]">
                          {conversations.length}
                        </span>
                      )}
                    </h2>
                    <div className="flex gap-2">
                      <button onClick={handleCleanupLids} disabled={scanning} className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50" title="Eliminar identificadores internos (LIDs) de WhatsApp">
                        {scanning ? "⏳" : "🧹"}
                      </button>
                      <button onClick={handleSyncNames} disabled={scanning} className="text-xs text-emerald-600 hover:text-emerald-800 disabled:opacity-50" title="Actualizar nombres desde contactos">
                        {scanning ? "⏳" : "👤"}
                      </button>
                      <button onClick={handleScan} disabled={scanning} className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50">
                        {scanning ? "⏳" : "🔍"}
                      </button>
                    </div>
                  </div>
                  {scanResult && <div className="px-3 py-1.5 bg-emerald-50 border-b text-xs text-emerald-700">{scanResult}</div>}
                  <ConversationList conversations={conversations} selectedId={selectedId} onSelect={id => setSelectedId(id)} />
                </div>

                {/* Panel de conversación — full screen en móvil */}
                <div className={`
                  ${showChatPanel ? "flex" : "hidden md:flex"}
                  flex-1 overflow-hidden bg-gray-50 flex-col min-w-0
                `}>
                  {/* Botón "volver" en móvil */}
                  {showChatPanel && (
                    <div className="md:hidden px-3 py-2 bg-white border-b border-gray-100 flex items-center gap-2">
                      <button onClick={() => setSelectedId(null)} className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                        ← Conversaciones
                      </button>
                    </div>
                  )}
                  <JulietaAlertsPanel />
                  {selectedConv
                    ? <ConversationPanel conversation={selectedConv} onModeChange={handleModeChange} onDelete={handleDelete} />
                    : <div className="flex flex-1 items-center justify-center text-gray-400 text-sm p-6 text-center">
                        <div>
                          <div className="text-4xl mb-3">💬</div>
                          <p className="font-medium">Selecciona una conversación</p>
                          <p className="text-xs mt-1 text-gray-300">Aparecerá el historial completo</p>
                        </div>
                      </div>
                  }
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-50 p-8">
                <div className="text-center max-w-sm">
                  <div className="text-5xl mb-4">📱</div>
                  <h2 className="text-lg font-bold text-gray-800 mb-2">WhatsApp no conectado</h2>
                  <p className="text-sm text-gray-500 mb-5">
                    Para recibir y enviar mensajes, conecta WhatsApp desde el panel de Ajustes.
                  </p>
                  <button
                    onClick={() => setActiveModule("settings" as import("./layout/Sidebar").Module)}
                    className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-600 transition-colors"
                  >
                    Ir a Ajustes → WhatsApp
                  </button>
                </div>
              </div>
            )
          )}

          {activeModule === "crm"        && canAccess(perms,"crm",isMaster,isAdmin)        && <KanbanBoard />}
          {activeModule === "calendar"   && canAccess(perms,"calendar",isMaster,isAdmin)   && <CalendarModule />}
          {activeModule === "analytics"  && canAccess(perms,"analytics",isMaster,isAdmin)  && <AnalyticsModule />}
          {activeModule === "accounting" && canAccess(perms,"accounting",isMaster,isAdmin) && <AccountingModule />}
          {activeModule === "suppliers"  && canAccess(perms,"suppliers",isMaster,isAdmin)  && <SuppliersModule />}
          {activeModule === "products"   && canAccess(perms,"products",isMaster,isAdmin)   && <ProductsModule />}
          {activeModule === "campaigns"  && canAccess(perms,"campaigns",isMaster,isAdmin)  && <CampaignsModule />}
          {activeModule === "documents"  && canAccess(perms,"documents",isMaster,isAdmin)  && <DocumentsModule />}
          {activeModule === "settings"   && canAccess(perms,"settings",isMaster,isAdmin)   && <SettingsModule currentUser={currentUser} />}
          {activeModule === "flows"        && <FlowBuilder />}
          {activeModule === "subscription" && <SubscriptionModule />}
          {activeModule === "help"         && <HelpModule />}
          {activeModule === "tickets"      && <TicketsModule isMaster={currentUser?.role === "master" || currentUser?.isMaster} />}
          {activeModule === "autopilot"    && <AutopilotModule />}
        </div>
      </div>
    </div>
  );
}
