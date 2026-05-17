export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";

interface ProductExtracted {
  name: string;
  price: number;
  description: string | null;
}

async function extractProductsFromImage(base64: string, mimeType: string): Promise<ProductExtracted[]> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:8080",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Analiza esta imagen de catálogo de productos y extrae TODOS los productos visibles.

Para cada producto identifica:
- name: nombre del producto (texto exacto)
- price: precio como número entero sin símbolos ni puntos de miles (ej: 240000). Si no hay precio usa 0.
- description: descripción corta si aparece, si no usa null.

Responde ÚNICAMENTE con JSON válido sin explicaciones:
[{"name": "...", "price": 0, "description": "..."}]

Si no hay productos visibles responde: []`
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` }
          }
        ]
      }],
      max_tokens: 1000,
      temperature: 0.1,
    }),
  });

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "[]";
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { name?: string; price?: unknown; description?: unknown }[];
    return parsed
      .filter(p => p.name && String(p.name).trim())
      .map(p => ({
        name: String(p.name).trim(),
        price: Math.abs(Number(String(p.price ?? "0").replace(/[^0-9]/g, "")) || 0),
        description: p.description ? String(p.description).trim() || null : null,
      }));
  } catch { return []; }
}

export async function POST(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  if (!OPENROUTER_KEY) {
    return NextResponse.json({ error: "Configura OPENROUTER_API_KEY para usar esta función" }, { status: 400 });
  }

  const formData = await req.formData();
  const mode = (formData.get("mode") as string) ?? "preview";
  const files = formData.getAll("images") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "No se recibieron imágenes" }, { status: 400 });
  }
  if (files.length > 10) {
    return NextResponse.json({ error: "Máximo 10 imágenes por importación" }, { status: 400 });
  }

  const allProducts: (ProductExtracted & { source_image: string })[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const mimeType = file.type || "image/jpeg";
      if (!mimeType.startsWith("image/")) { errors.push(`${file.name}: no es una imagen`); continue; }
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const products = await extractProductsFromImage(base64, mimeType);
      for (const p of products) {
        allProducts.push({ ...p, source_image: file.name });
      }
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }

  // Deduplicar por nombre
  const seen = new Set<string>();
  const unique = allProducts.filter(p => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (mode === "preview") {
    return NextResponse.json({
      preview: unique.slice(0, 20),
      total: unique.length,
      errors,
      images_processed: files.length,
    });
  }

  // import mode
  let imported = 0, skipped = 0;
  for (const p of unique) {
    try {
      const exists = db.prepare("SELECT id FROM products WHERE name=?").get(p.name);
      if (exists) { skipped++; continue; }
      db.prepare(
        "INSERT INTO products (name, description, price_per_person, active) VALUES (?,?,?,1)"
      ).run(p.name, p.description, p.price);
      imported++;
    } catch (e) {
      errors.push(`Error importando "${p.name}": ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ imported, skipped, errors });
}
