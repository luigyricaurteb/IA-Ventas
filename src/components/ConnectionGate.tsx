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
import { getAllowedModules, canAccess } from "@/lib/auth-client";

interface Conversation {
  id: number; phone: string; name: string | null;
  mode: "AI" | "HUMAN"; last_message_at: number | null;
  last_message_preview: string | null;
}

interface CurrentUser {
  id: number; username: string; name: string; role: string;
}

export default function ConnectionGate() {
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [initialChecked, setInitialChecked] = useState(false);
  const [activeModule, setActiveModule] = useState<Module>("chat");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  useEffect(() => {
    // Verificar sesión — si no es válida, redirigir al login
    fetch("/api/auth/me").then((r) => {
      if (r.status === 401) {
        window.location.href = "/login";
        return null;
      }
      return r.json();
    }).then((d) => {
      if (d?.user) setCurrentUser(d.user);
    }).catch(() => {});

    // Verificar conexión WhatsApp
    fetch("/api/connection/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "connected" && data.phone) {
          setPhone(data.phone); setConnected(true);
        }
        setInitialChecked(true);
      })
      .catch(() => setInitialChecked(true));
  }, []);

  // Asegurar que el módulo activo sea accesible para el rol
  useEffect(() => {
    if (!currentUser) return;
    const allowed = getAllowedModules(currentUser.role);
    if (!allowed.includes(activeModule)) setActiveModule(allowed[0] ?? "chat");
  }, [currentUser, activeModule]);

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
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, mode } : c));
  }
  function handleDelete(id: number) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function handleScan() {
    setScanning(true); setScanResult(null);
    const res = await fetch("/api/conversations/scan", { method: "POST" });
    const d = await res.json();
    setScanResult(`✓ ${d.scanned} de ${d.total} conversaciones escaneadas y actualizadas.`);
    setScanning(false);
    setTimeout(() => setScanResult(null), 5000);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!initialChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!connected) return <QRScreen onConnected={handleConnected} />;

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;
  const role = currentUser?.role ?? "ventas";
  const allowedModules = getAllowedModules(role);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={activeModule} onChange={setActiveModule} allowedModules={allowedModules} />

      <div className="flex flex-col flex-1 overflow-hidden">
        <DashboardHeader phone={phone} onDisconnect={handleDisconnect} currentUser={currentUser} onLogout={handleLogout} />

        <div className="flex flex-1 overflow-hidden">
          {activeModule === "chat" && canAccess(role, "chat") && (
            <>
              <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversaciones</h2>
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    title="Escanear conversaciones anteriores con IA"
                    className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
                  >
                    {scanning ? "⏳" : "🔍 Escanear"}
                  </button>
                </div>
                {scanResult && (
                  <div className="px-3 py-1.5 bg-emerald-50 border-b text-xs text-emerald-700">{scanResult}</div>
                )}
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
          )}
          {activeModule === "crm"         && canAccess(role, "crm")         && <KanbanBoard />}
          {activeModule === "calendar"    && canAccess(role, "calendar")    && <CalendarModule />}
          {activeModule === "analytics"   && canAccess(role, "analytics")   && <AnalyticsModule />}
          {activeModule === "accounting"  && canAccess(role, "accounting")  && <AccountingModule />}
          {activeModule === "suppliers"   && canAccess(role, "suppliers")   && <SuppliersModule />}
          {activeModule === "products"    && canAccess(role, "products")    && <ProductsModule />}
          {activeModule === "campaigns"   && canAccess(role, "campaigns")   && <CampaignsModule />}
          {activeModule === "documents"   && canAccess(role, "documents")   && <DocumentsModule />}
          {activeModule === "settings"    && canAccess(role, "settings")    && <SettingsModule currentUser={currentUser} />}
        </div>
      </div>
    </div>
  );
}
