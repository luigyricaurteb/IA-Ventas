import { NextRequest, NextResponse } from "next/server";
import { getCompanyDb } from "@/lib/master/db-company";
import { getUserFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Ctx { params: Promise<{ id: string }> }

interface DriveSource {
  id: number; name: string; drive_url: string;
  file_id: string; file_type: "sheet" | "doc" | "file";
  topic: string; last_synced_at: number | null;
  sync_status: string; sync_error: string | null; active: number;
}

function getExportUrl(fileId: string, fileType: string): string {
  if (fileType === "sheet") return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
  if (fileType === "doc")   return `https://docs.google.com/document/d/${fileId}/export?format=txt`;
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const db = getCompanyDb(me.company ?? "platform");

  const source = db.prepare("SELECT * FROM drive_sources WHERE id=?").get(Number(id)) as DriveSource | null;
  if (!source) return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });

  try {
    const exportUrl = getExportUrl(source.file_id, source.file_type);
    const res = await fetch(exportUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`El archivo devolvió HTTP ${res.status}. Verifica que esté compartido como "Cualquiera con el enlace"`);
    const content = await res.text();
    if (!content.trim()) throw new Error("El archivo está vacío o sin permisos públicos");

    const topicKey = `[Drive] ${source.name}`;
    const existing = db.prepare("SELECT id FROM ai_learnings WHERE topic=?").get(topicKey) as { id: number } | null;
    if (existing) {
      db.prepare("UPDATE ai_learnings SET content=?, created_at=unixepoch() WHERE id=?").run(content.slice(0, 10000), existing.id);
    } else {
      db.prepare("INSERT INTO ai_learnings (topic, content) VALUES (?,?)").run(topicKey, content.slice(0, 10000));
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE drive_sources SET sync_status='ok', sync_error=NULL, last_synced_at=? WHERE id=?").run(now, Number(id));
    return NextResponse.json({ ok: true, synced_at: now, rows: content.split("\n").length });
  } catch (e) {
    const msg = (e as Error).message;
    db.prepare("UPDATE drive_sources SET sync_status='error', sync_error=? WHERE id=?").run(msg, Number(id));
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const me = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (!me || (!me.is_admin && me.role !== "master")) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const { id } = await params;
  const db = getCompanyDb(me.company ?? "platform");

  const source = db.prepare("SELECT * FROM drive_sources WHERE id=?").get(Number(id)) as DriveSource | null;
  if (source) {
    // Also remove the associated ai_learning
    db.prepare("DELETE FROM ai_learnings WHERE topic=?").run(`[Drive] ${source.name}`);
  }
  db.prepare("DELETE FROM drive_sources WHERE id=?").run(Number(id));
  return NextResponse.json({ ok: true });
}
