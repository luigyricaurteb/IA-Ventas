/**
 * Google Sheets Sync — Reservas bidireccional
 *
 * Arquitectura:
 * - UNA cuenta de servicio para toda la plataforma (GOOGLE_SERVICE_ACCOUNT_JSON en Railway)
 * - Cada empresa comparte su Google Sheet con el email de esa cuenta
 * - Sincronización automática: reserva creada/actualizada → Sheet actualizado
 * - Al iniciar: importa filas del Sheet que no estén en la DB
 */

import { google } from "googleapis";
import type Database from "better-sqlite3";

// ── Cabeceras fijas de la hoja ────────────────────────────────────────────────
export const SHEET_HEADERS = [
  "ID Reserva",
  "Fecha Creación",
  "Cliente",
  "Teléfono",
  "Email",
  "Servicio",
  "Fecha Servicio",
  "Personas",
  "Estado",
  "Valor Total",
  "Notas",
  "Última Actualización",
];

// ── Autenticación con Service Account ────────────────────────────────────────
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no configurado en Railway");

  const credentials = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
  };

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// Extraer el ID del Sheet de una URL o del ID directo
export function extractSheetId(urlOrId: string): string {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? urlOrId.trim();
}

// ── Verificar conexión ────────────────────────────────────────────────────────
export async function verifySheetAccess(sheetUrl: string): Promise<{
  ok: boolean; title?: string; error?: string;
}> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = extractSheetId(sheetUrl);

    const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    return { ok: true, title: res.data.properties?.title ?? "Sin título" };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("403") || msg.includes("forbidden") || msg.toLowerCase().includes("permission")) {
      return { ok: false, error: `Sin acceso. Comparte la hoja con: hivo-sheets-sync@hivo-sheets-sync.iam.gserviceaccount.com` };
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return { ok: false, error: "Hoja no encontrada. Verifica el link." };
    }
    return { ok: false, error: msg };
  }
}

// ── Inicializar hoja con cabeceras ───────────────────────────────────────────
async function ensureHeaders(sheets: ReturnType<typeof google.sheets>, sheetId: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "A1:L1",
  });
  const firstRow = res.data.values?.[0] ?? [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "A1",
      valueInputOption: "RAW",
      requestBody: { values: [SHEET_HEADERS] },
    });
  }
}

// ── Convertir reserva de DB a fila de Sheet ──────────────────────────────────
interface ReservationRow {
  id: number;
  reservation_code: string | null;
  client_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  service_name: string | null;
  service_date: number | null;
  people_count: number;
  status: string;
  total_value: number | null;
  notes: string | null;
  updated_at: number;
  created_at: number;
}

function toSheetRow(r: ReservationRow): string[] {
  return [
    r.reservation_code ?? `RES-${r.id}`,
    new Date(r.created_at * 1000).toLocaleDateString("es-CO"),
    r.contact_name ?? r.client_name ?? "",
    r.phone ?? "",
    r.email ?? "",
    r.service_name ?? "",
    r.service_date ? new Date(r.service_date * 1000).toLocaleDateString("es-CO") : "",
    String(r.people_count),
    r.status,
    r.total_value ? `$${r.total_value.toLocaleString("es-CO")}` : "",
    r.notes ?? "",
    new Date(r.updated_at * 1000).toLocaleString("es-CO"),
  ];
}

// ── Exportar TODAS las reservas al Sheet ─────────────────────────────────────
export async function exportReservationsToSheet(
  db: Database.Database,
  sheetUrl: string
): Promise<{ ok: boolean; exported: number; error?: string }> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = extractSheetId(sheetUrl);

    await ensureHeaders(sheets, sheetId);

    const reservations = db.prepare(`
      SELECT r.id, r.reservation_code, r.people_count, r.status,
             r.service_date, r.service_name, r.total_value, r.notes,
             r.created_at, r.updated_at,
             r.client_name,
             COALESCE(ct.full_name, r.client_name) as contact_name, ct.email,
             c.phone
      FROM reservations r
      LEFT JOIN contacts ct ON ct.conversation_id = (
        SELECT conversation_id FROM contacts WHERE id = r.contact_id LIMIT 1
      )
      LEFT JOIN conversations c ON c.id = (
        SELECT conversation_id FROM contacts WHERE id = r.contact_id LIMIT 1
      )
      ORDER BY r.created_at DESC
    `).all() as ReservationRow[];

    if (reservations.length === 0) {
      return { ok: true, exported: 0 };
    }

    const rows = reservations.map(toSheetRow);

    // Limpiar datos existentes (excepto cabeceras) y reescribir
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: "A2:L10000",
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "A2",
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });

    return { ok: true, exported: rows.length };
  } catch (e) {
    return { ok: false, exported: 0, error: (e as Error).message };
  }
}

// ── Agregar o actualizar UNA reserva en el Sheet ──────────────────────────────
export async function upsertReservationInSheet(
  db: Database.Database,
  sheetUrl: string,
  reservationId: number
): Promise<void> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = extractSheetId(sheetUrl);

    await ensureHeaders(sheets, sheetId);

    const r = db.prepare(`
      SELECT r.id, r.reservation_code, r.people_count, r.status,
             r.service_date, r.service_name, r.total_value, r.notes,
             r.created_at, r.updated_at,
             r.client_name,
             COALESCE(ct.full_name, r.client_name) as contact_name, ct.email,
             c.phone
      FROM reservations r
      LEFT JOIN contacts ct ON ct.conversation_id = (
        SELECT conversation_id FROM contacts WHERE id = r.contact_id LIMIT 1
      )
      LEFT JOIN conversations c ON c.id = (
        SELECT conversation_id FROM contacts WHERE id = r.contact_id LIMIT 1
      )
      WHERE r.id = ?
    `).get(reservationId) as ReservationRow | null;

    if (!r) return;

    const newRow = toSheetRow(r);
    const code = r.reservation_code ?? `RES-${r.id}`;

    // Buscar si ya existe la fila por código
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "A2:A10000",
    });

    const rows = existing.data.values ?? [];
    const rowIndex = rows.findIndex(row => row[0] === code);

    if (rowIndex >= 0) {
      // Actualizar fila existente
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `A${rowIndex + 2}`,
        valueInputOption: "RAW",
        requestBody: { values: [newRow] },
      });
    } else {
      // Agregar nueva fila
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: "A2",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [newRow] },
      });
    }
  } catch (e) {
    console.error("[sheets] Error sincronizando reserva:", (e as Error).message);
  }
}

// ── Importar desde Sheet a la DB (recuperación) ───────────────────────────────
export async function importReservationsFromSheet(
  db: Database.Database,
  sheetUrl: string
): Promise<{ ok: boolean; imported: number; skipped: number; error?: string }> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const sheetId = extractSheetId(sheetUrl);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "A2:L10000",
    });

    const rows = res.data.values ?? [];
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const code       = row[0] as string;
      const clientName = row[2] as string;
      const phone      = row[3] as string;
      const service    = row[5] as string;
      const dateStr    = row[6] as string;
      const people     = parseInt(row[7] ?? "1") || 1;
      const status     = (row[8] as string) ?? "pending";

      if (!code) continue;

      // Verificar si ya existe en la DB
      const existing = db.prepare("SELECT id FROM reservations WHERE reservation_code=? LIMIT 1").get(code);
      if (existing) { skipped++; continue; }

      // Crear conversación/contacto si no existe
      let convId: number | null = null;
      if (phone) {
        let conv = db.prepare("SELECT id FROM conversations WHERE phone=? LIMIT 1").get(phone.replace(/\D/g, "")) as { id: number } | null;
        if (!conv) {
          conv = db.prepare("INSERT INTO conversations (phone, name) VALUES (?,?) RETURNING id").get(phone.replace(/\D/g, ""), clientName || null) as { id: number } | null;
        }
        convId = conv?.id ?? null;
      }

      // Crear contacto si no existe
      let contactId: number | null = null;
      if (convId && clientName) {
        let contact = db.prepare("SELECT id FROM contacts WHERE conversation_id=? LIMIT 1").get(convId) as { id: number } | null;
        if (!contact) {
          contact = db.prepare("INSERT INTO contacts (conversation_id, full_name) VALUES (?,?) RETURNING id").get(convId, clientName) as { id: number } | null;
        }
        contactId = contact?.id ?? null;
      }

      // Parsear fecha
      let serviceDate: number | null = null;
      if (dateStr) {
        try {
          const parts = dateStr.split("/");
          if (parts.length === 3) {
            const d = new Date(`${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`);
            serviceDate = Math.floor(d.getTime() / 1000);
          }
        } catch {}
      }

      db.prepare(`
        INSERT INTO reservations (reservation_code, contact_id, service_name, service_date, people_count, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(code, contactId, service || null, serviceDate, people, status);

      imported++;
    }

    return { ok: true, imported, skipped };
  } catch (e) {
    return { ok: false, imported: 0, skipped: 0, error: (e as Error).message };
  }
}

// ── Email de la cuenta de servicio (para mostrar al usuario) ──────────────────
export function getServiceAccountEmail(): string {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return "hivo-sheets-sync@hivo-sheets-sync.iam.gserviceaccount.com";
    const creds = JSON.parse(raw) as { client_email: string };
    return creds.client_email;
  } catch {
    return "hivo-sheets-sync@hivo-sheets-sync.iam.gserviceaccount.com";
  }
}
