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
  const [connected, setConnected]     = useState(false);
  const [phone, setPhone]             = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId]   = useState<number | null>(null);
  const [initialChecked, setInitialChecked] = useState(false);
  const [activeModule, setActiveModule] = useState<Module>("chat");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [scanning, setScanning]       = useState(false);
  const [scanResult, setScanResult]   = useState<string | null>(null);

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
    const allowed = getAllowedModules(currentUser.permissions, currentUser.isMaster);
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

  useEffect(() => {
    if (!connected) return;
    fetchConversations();
    const interval = setInterval(fetchConversations, 2000);
    return () => clearInterval(interval);
  }, [connected, fetchConversations]);

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

  if (!initialChecked) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900"><div className="w-8 h-8 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" /></div>;
  }

  // Usuarios normales sin WhatsApp conectado → pantalla QR
  if (!connected && !currentUser?.isMaster) return <QRScreen onConnected={handleConnected} />;

  const selectedConv  = conversations.find(c => c.id === selectedId) ?? null;
  const perms         = currentUser?.permissions ?? {};
  const isMaster      = currentUser?.isMaster ?? false;
  const allowedMods   = getAllowedModules(perms, isMaster);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={activeModule} onChange={setActiveModule} allowedModules={allowedMods} />

      <div className="flex flex-col flex-1 overflow-hidden">
        <DashboardHeader phone={phone} onDisconnect={handleDisconnect} currentUser={currentUser} onLogout={handleLogout} />

        <div className="flex flex-1 overflow-hidden">
          {/* Módulo exclusivo master: gestión de plataforma */}
          {activeModule === "master" && isMaster && <MasterDashboard onLogout={handleLogout} />}

          {activeModule === "chat" && canAccess(perms, "chat", isMaster) && (
            connected ? (
              <>
                <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversaciones</h2>
                    <button onClick={handleScan} disabled={scanning} title="Escanear con IA" className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50">
                      {scanning ? "⏳" : "🔍 Escanear"}
                    </button>
                  </div>
                  {scanResult && <div className="px-3 py-1.5 bg-emerald-50 border-b text-xs text-emerald-700">{scanResult}</div>}
                  <ConversationList conversations={conversations} selectedId={selectedId} onSelect={setSelectedId} />
                </div>
                <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col">
                  <JulietaAlertsPanel />
                  {selectedConv
                    ? <ConversationPanel conversation={selectedConv} onModeChange={handleModeChange} onDelete={handleDelete} />
                    : <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">Selecciona una conversación</div>
                  }
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-auto">
                <QRScreen onConnected={handleConnected} />
              </div>
            )
          )}
          {activeModule === "crm"        && canAccess(perms,"crm",isMaster)        && <KanbanBoard />}
          {activeModule === "calendar"   && canAccess(perms,"calendar",isMaster)   && <CalendarModule />}
          {activeModule === "analytics"  && canAccess(perms,"analytics",isMaster)  && <AnalyticsModule />}
          {activeModule === "accounting" && canAccess(perms,"accounting",isMaster) && <AccountingModule />}
          {activeModule === "suppliers"  && canAccess(perms,"suppliers",isMaster)  && <SuppliersModule />}
          {activeModule === "products"   && canAccess(perms,"products",isMaster)   && <ProductsModule />}
          {activeModule === "campaigns"  && canAccess(perms,"campaigns",isMaster)  && <CampaignsModule />}
          {activeModule === "documents"  && canAccess(perms,"documents",isMaster)  && <DocumentsModule />}
          {activeModule === "settings"   && canAccess(perms,"settings",isMaster)   && <SettingsModule currentUser={currentUser} />}
          {activeModule === "help" && <HelpModule />}
        </div>
      </div>
    </div>
  );
}
