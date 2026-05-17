export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import * as XLSX from "xlsx";

// Mapeo flexible de nombres de columna → campo interno
const COL_MAP: Record<string, string[]> = {
  name:         ["name","nombre","product name","nombre del producto","title","título","titulo","producto"],
  price:        ["price","precio","price_per_person","precio por persona","retail price","precio de venta","valor","costo","cost","amount","monto"],
  description:  ["description","descripción","descripcion","details","detalles","info","información","informacion","detalle"],
  ai_instructions: ["ai_instructions","instrucciones ia","notas ia","notas","notes","tips","ia","ai notes","instrucciones"],
};

function findCol(headers: string[], fieldCandidates: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const candidate of fieldCandidates) {
    const idx = lower.findIndex(h => h === candidate || h.includes(candidate));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function cleanPrice(raw: unknown): number {
  if (typeof raw === "number") return Math.abs(raw);
  const str = String(raw ?? "").replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : Math.abs(n);
}

interface ParsedProduct {
  name: string;
  description: string | null;
  price_per_person: number;
  ai_instructions: string | null;
}

function parseSheet(rows: Record<string, unknown>[]): { products: ParsedProduct[]; errors: string[] } {
  if (rows.length === 0) return { products: [], errors: ["El archivo está vacío"] };

  const headers = Object.keys(rows[0]);
  const nameCol  = findCol(headers, COL_MAP.name);
  const priceCol = findCol(headers, COL_MAP.price);
  const descCol  = findCol(headers, COL_MAP.description);
  const aiCol    = findCol(headers, COL_MAP.ai_instructions);

  if (!nameCol) return { products: [], errors: ["No se encontró columna de nombre. Columnas detectadas: " + headers.join(", ")] };

  const products: ParsedProduct[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[nameCol] ?? "").trim();
    if (!name || name.toLowerCase() === "nan") continue;

    const price = priceCol ? cleanPrice(row[priceCol]) : 0;
    const desc  = descCol  ? String(row[descCol] ?? "").trim() || null : null;
    const ai    = aiCol    ? String(row[aiCol] ?? "").trim() || null   : null;

    if (name.length > 200) { errors.push(`Fila ${i + 2}: nombre demasiado largo`); continue; }

    products.push({ name, description: desc, price_per_person: price, ai_instructions: ai });
  }

  return { products, errors };
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) ?? "preview"; // preview | import

  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["csv","xlsx","xls"].includes(ext ?? "")) {
    return NextResponse.json({ error: "Formato no soportado. Usa CSV, XLSX o XLS." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Error al leer el archivo. Verifica que sea un CSV o Excel válido." }, { status: 400 });
  }

  const { products, errors } = parseSheet(rows);

  if (mode === "preview") {
    return NextResponse.json({
      preview: products.slice(0, 10),
      total: products.length,
      errors,
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    });
  }

  // mode === "import" — insertar en DB
  let imported = 0;
  let skipped  = 0;
  const importErrors: string[] = [...errors];

  for (const p of products) {
    try {
      const exists = db.prepare("SELECT id FROM products WHERE name=?").get(p.name);
      if (exists) { skipped++; continue; }
      db.prepare(
        "INSERT INTO products (name, description, price_per_person, ai_instructions, active) VALUES (?,?,?,?,1)"
      ).run(p.name, p.description, p.price_per_person, p.ai_instructions);
      imported++;
    } catch (e) {
      importErrors.push(`Error importando "${p.name}": ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ imported, skipped, errors: importErrors });
}
