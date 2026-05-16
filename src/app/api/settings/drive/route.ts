import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function extractFileId(url: string): { fileId: string; fileType: "sheet" | "doc" | "file" } | null {
  // Google Sheets: /spreadsheets/d/FILE_ID
  const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) return { fileId: sheetMatch[1], fileType: "sheet" };

  // Google Docs: /document/d/FILE_ID
  const docMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return { fileId: docMatch[1], fileType: "doc" };

  // Generic Drive: /file/d/FILE_ID or id=FILE_ID
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) return { fileId: driveMatch[1], fileType: "file" };

  return null;
}

function getExportUrl(fileId: string, fileType: "sheet" | "doc" | "file"): string {
  if (fileType === "sheet") return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
  if (fileType === "doc")   return `https://docs.google.com/document/d/${fileId}/export?format=txt`;
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export async function GET(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = getCompanyDb(me.company ?? "platform");
  const sources = db.prepare("SELECT * FROM drive_sources ORDER BY name ASC").all();
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me || (!me.is_admin && me.role !== "master")) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const body = await req.json() as { name?: string; drive_url?: string; topic?: string };
  const { name, drive_url, topic } = body;
  if (!name || !drive_url || !topic) return NextResponse.json({ error: "Nombre, URL y tema requeridos" }, { status: 400 });

  const parsed = extractFileId(drive_url);
  if (!parsed) return NextResponse.json({ error: "URL de Google Drive no reconocida. Asegúrate de compartir como 'Cualquiera con el enlace'" }, { status: 400 });

  const db = getCompanyDb(me.company ?? "platform");

  // Try initial sync immediately
  let syncStatus = "pending";
  let syncError: string | null = null;
  let lastSyncedAt: number | null = null;

  try {
    const exportUrl = getExportUrl(parsed.fileId, parsed.fileType);
    const res = await fetch(exportUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = await res.text();
    if (!content.trim()) throw new Error("El archivo está vacío o no tiene permisos públicos");

    const topicKey = `[Drive] ${name}`;
    const existing = db.prepare("SELECT id FROM ai_learnings WHERE topic=?").get(topicKey) as { id: number } | null;
    if (existing) {
      db.prepare("UPDATE ai_learnings SET content=? WHERE id=?").run(content.slice(0, 10000), existing.id);
    } else {
      db.prepare("INSERT INTO ai_learnings (topic, content) VALUES (?,?)").run(topicKey, content.slice(0, 10000));
    }
    syncStatus = "ok";
    lastSyncedAt = Math.floor(Date.now() / 1000);
  } catch (e) {
    syncError = (e as Error).message;
    syncStatus = "error";
  }

  const source = db.prepare(
    "INSERT INTO drive_sources (name, drive_url, file_id, file_type, topic, last_synced_at, sync_status, sync_error) VALUES (?,?,?,?,?,?,?,?) RETURNING *"
  ).get(name, drive_url, parsed.fileId, parsed.fileType, topic, lastSyncedAt, syncStatus, syncError);

  return NextResponse.json({ source, syncStatus, syncError }, { status: 201 });
}
