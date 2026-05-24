"use client";

import { useState, useEffect, useRef } from "react";

interface ProductImage { id: number; filename: string; order_index: number; is_main: number }
interface Product {
  id: number; name: string; description: string | null;
  price_per_person: number; ai_instructions: string | null;
  active: number; product_type: string; images: ProductImage[];
  slug: string | null;
}
interface ImportPreview {
  name: string; description: string | null;
  price_per_person: number; ai_instructions: string | null;
}

const EMPTY: Omit<Product, "id" | "images"> = {
  name: "", description: "", price_per_person: 0, ai_instructions: "", active: 1, product_type: "servicio", slug: null,
};

function PreviewTable({ rows, total, errors }: { rows: ImportPreview[]; total: number; errors: string[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700">Vista previa — {total} producto{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>
        {total > 10 && <span className="text-xs text-gray-400">Mostrando primeros 10</span>}
      </div>
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 text-gray-500 font-semibold">Nombre</th>
              <th className="text-right px-3 py-2 text-gray-500 font-semibold">Precio</th>
              <th className="text-left px-3 py-2 text-gray-500 font-semibold">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px] truncate">{p.name}</td>
                <td className="px-3 py-2 text-right text-emerald-600 font-semibold whitespace-nowrap">
                  {p.price_per_person > 0 ? `$${p.price_per_person.toLocaleString("es-CO")}` : "—"}
                </td>
                <td className="px-3 py-2 text-gray-500 max-w-[200px] truncate">{p.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errors.length > 0 && (
        <div className="mt-2 bg-orange-50 border border-orange-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-orange-700 mb-1">Advertencias:</p>
          {errors.slice(0,5).map((e, i) => <p key={i} className="text-xs text-orange-600">{e}</p>)}
        </div>
      )}
    </div>
  );
}

export default function ProductsModule() {
  const [products, setProducts] = useState<Product[]>([]);
  const [companySlug, setCompanySlug] = useState<string>("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "vision">("file");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview[] | null>(null);
  const [importTotal, setImportTotal] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Vision import state
  const [visionFiles, setVisionFiles] = useState<File[]>([]);
  const [visionPreview, setVisionPreview] = useState<ImportPreview[] | null>(null);
  const [visionTotal, setVisionTotal] = useState(0);
  const [visionErrors, setVisionErrors] = useState<string[]>([]);
  const [visionLoading, setVisionLoading] = useState(false);
  const visionInputRef = useRef<HTMLInputElement>(null);

  async function fetch_() {
    const res = await fetch("/api/products");
    if (res.ok) setProducts((await res.json()).products);
  }
  useEffect(() => {
    fetch_();
    fetch("/api/auth/me").then(r => r.json()).then(d => setCompanySlug(d?.user?.company ?? "")).catch(() => {});
  }, []);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowForm(true); }
  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "", price_per_person: p.price_per_person, ai_instructions: p.ai_instructions ?? "", active: p.active, product_type: p.product_type ?? "servicio", slug: p.slug ?? null });
    setShowForm(true);
  }

  async function save() {
    if (editing) {
      await fetch(`/api/products/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); fetch_();
    } else {
      const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json() as { product: Product };
      // Auto-switch to edit mode so user can upload images immediately
      await fetch_();
      const fresh = await fetch("/api/products").then(r => r.json()) as { products: Product[] };
      const created = fresh.products.find(p => p.id === d.product.id) ?? d.product;
      setEditing({ ...created, images: created.images ?? [] });
      // keep form open for images
    }
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este producto?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    fetch_();
  }

  async function uploadImage(productId: number, file: File, isMain = false) {
    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("is_main", isMain ? "1" : "0");
    const res = await fetch(`/api/products/${productId}/images`, { method: "POST", body: fd });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      alert(d.error ?? "Error al subir imagen");
    }
    setUploading(false);
    // Refresh editing product images
    const fresh = await fetch("/api/products").then(r => r.json()) as { products: Product[] };
    const updated = fresh.products.find(p => p.id === productId);
    if (updated && editing?.id === productId) setEditing(updated);
    setProducts(fresh.products);
  }

  async function deleteImage(productId: number, imageId: number) {
    await fetch(`/api/products/${productId}/images`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId }),
    });
    const fresh = await fetch("/api/products").then(r => r.json()) as { products: Product[] };
    setProducts(fresh.products);
    const updated = fresh.products.find(p => p.id === productId);
    if (updated && editing?.id === productId) setEditing(updated);
  }

  async function handleImportFile(file: File) {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportErrors([]);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "preview");
    const res = await fetch("/api/products/import", { method: "POST", body: fd });
    const d = await res.json() as { preview?: ImportPreview[]; total?: number; errors?: string[]; columns?: string[]; error?: string };
    if (!res.ok) { setImportErrors([d.error ?? "Error"]); return; }
    setImportPreview(d.preview ?? []);
    setImportTotal(d.total ?? 0);
    setImportErrors(d.errors ?? []);
    setImportColumns(d.columns ?? []);
  }

  async function confirmImport() {
    if (!importFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("mode", "import");
    const res = await fetch("/api/products/import", { method: "POST", body: fd });
    const d = await res.json() as { imported?: number; skipped?: number; errors?: string[] };
    setImporting(false);
    setImportResult({ imported: d.imported ?? 0, skipped: d.skipped ?? 0 });
    setImportErrors(d.errors ?? []);
    fetch_();
  }

  function closeImport() {
    setShowImport(false);
    setImportFile(null);
    setImportPreview(null);
    setImportTotal(0);
    setImportErrors([]);
    setImportColumns([]);
    setImportResult(null);
    setVisionFiles([]);
    setVisionPreview(null);
    setVisionTotal(0);
    setVisionErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (visionInputRef.current) visionInputRef.current.value = "";
  }

  async function handleVisionFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 10);
    if (arr.length === 0) return;
    setVisionFiles(arr);
    setVisionPreview(null);
    setVisionErrors([]);
    setImportResult(null);
    setVisionLoading(true);
    const fd = new FormData();
    arr.forEach(f => fd.append("images", f));
    fd.append("mode", "preview");
    const res = await fetch("/api/products/import-vision", { method: "POST", body: fd });
    const d = await res.json() as { preview?: ImportPreview[]; total?: number; errors?: string[]; error?: string };
    setVisionLoading(false);
    if (!res.ok) { setVisionErrors([d.error ?? "Error al analizar imágenes"]); return; }
    setVisionPreview(d.preview ?? []);
    setVisionTotal(d.total ?? 0);
    setVisionErrors(d.errors ?? []);
  }

  async function confirmVisionImport() {
    if (visionFiles.length === 0) return;
    setImporting(true);
    const fd = new FormData();
    visionFiles.forEach(f => fd.append("images", f));
    fd.append("mode", "import");
    const res = await fetch("/api/products/import-vision", { method: "POST", body: fd });
    const d = await res.json() as { imported?: number; skipped?: number; errors?: string[] };
    setImporting(false);
    setImportResult({ imported: d.imported ?? 0, skipped: d.skipped ?? 0 });
    setVisionErrors(d.errors ?? []);
    fetch_();
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Productos & Servicios</h1>
          <p className="text-xs text-gray-400 mt-0.5">Catálogo de servicios que Julieta usa para cotizar y el Autopilot para publicar</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowImport(true); setImportPreview(null); setImportResult(null); setImportErrors([]); }}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5">
            📥 Importar CSV/Excel
          </button>
          <button onClick={openNew} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
            + Nuevo producto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {products.map((p) => {
          const mainImg = p.images.find(i => i.is_main === 1) ?? p.images[0] ?? null;
          const extras = p.images.filter(i => i !== mainImg);
          return (
            <div key={p.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!p.active ? "opacity-60" : ""}`}>
              {/* Foto principal */}
              {mainImg ? (
                <div className="relative">
                  <img src={`/api/uploads/products/${mainImg.filename}`} className="w-full h-44 object-cover" />
                  <div className="absolute top-2 left-2 flex gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.product_type === "producto" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {p.product_type === "producto" ? "📦 Producto" : "🎯 Servicio"}
                    </span>
                    {extras.length > 0 && (
                      <span className="text-xs bg-black/50 text-white px-2 py-0.5 rounded-full">+{extras.length} fotos</span>
                    )}
                  </div>
                  {!p.active && <span className="absolute top-2 right-2 text-xs bg-gray-800/70 text-white px-2 py-0.5 rounded-full">Inactivo</span>}
                </div>
              ) : (
                <button onClick={() => openEdit(p)}
                  className="w-full h-36 bg-gray-50 flex flex-col items-center justify-center hover:bg-gray-100 transition-colors relative">
                  <span className="text-3xl mb-1">{p.product_type === "producto" ? "📦" : "🎯"}</span>
                  <span className="text-xs text-gray-400">Sin foto — clic para agregar</span>
                  <span className={`absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium ${p.product_type === "producto" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {p.product_type === "producto" ? "📦 Producto" : "🎯 Servicio"}
                  </span>
                </button>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-gray-800 truncate">{p.name}</h3>
                {p.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                <p className="text-emerald-600 font-bold mt-2">${p.price_per_person.toLocaleString("es-CO")} / persona</p>
                {p.slug && companySlug && (
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/tienda/${companySlug}/${p.slug}`;
                      navigator.clipboard.writeText(url).then(() => alert("Link copiado: " + url)).catch(() => prompt("Copia este link:", url));
                    }}
                    className="mt-2 w-full text-xs text-emerald-600 border border-emerald-200 rounded-lg py-1.5 hover:bg-emerald-50 transition-colors px-2">
                    🔗 Copiar link de pago
                  </button>
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => openEdit(p)} className="flex-1 text-sm border rounded-lg py-1.5 hover:bg-gray-50">✏️ Editar</button>
                  <button onClick={() => remove(p.id)} className="text-sm text-red-400 hover:text-red-600 px-3 border rounded-lg py-1.5">🗑</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="font-bold text-gray-800">{editing ? `Editar — ${editing.name}` : "Nuevo producto / servicio"}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">

              {/* Tipo */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Tipo</label>
                <div className="flex gap-2">
                  {[["servicio","🎯 Servicio"],["producto","📦 Producto"]].map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setForm({...form, product_type: val})}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.product_type === val ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-300 hover:border-emerald-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="text-sm font-medium text-gray-700">Nombre *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>

              {/* Descripción */}
              <div>
                <label className="text-sm font-medium text-gray-700">Descripción</label>
                <textarea value={form.description ?? ""} onChange={e => setForm({...form, description: e.target.value})}
                  rows={3} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm resize-none" />
              </div>

              {/* Precio */}
              <div>
                <label className="text-sm font-medium text-gray-700">Precio por persona (COP) *</label>
                <input type="number" value={form.price_per_person} onChange={e => setForm({...form, price_per_person: Number(e.target.value)})}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>

              {/* Fotos — solo si ya tiene ID (editando o recién creado) */}
              {editing && (
                <div className="space-y-3">
                  <div className="border-t pt-3">
                    <p className="text-sm font-semibold text-gray-700 mb-2">📷 Foto principal <span className="text-xs text-gray-400 font-normal">(la que Julieta envía al presentar el {form.product_type})</span></p>
                    {(() => {
                      const main = editing.images.find(i => i.is_main === 1);
                      return (
                        <div className="flex gap-3 items-start">
                          {main ? (
                            <div className="relative group">
                              <img src={`/api/uploads/products/${main.filename}`} className="h-28 w-28 object-cover rounded-xl border-2 border-emerald-400" />
                              <button onClick={() => deleteImage(editing.id, main.id)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                              <span className="absolute bottom-1 left-1 bg-emerald-500 text-white text-[10px] px-1 rounded">Principal</span>
                            </div>
                          ) : (
                            <label className="h-28 w-28 border-2 border-dashed border-emerald-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-colors shrink-0">
                              <span className="text-2xl">📷</span>
                              <span className="text-xs text-emerald-600 mt-1 text-center px-1">Subir foto principal</span>
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(editing.id, f, true); }} />
                            </label>
                          )}
                          {!main && (
                            <p className="text-xs text-gray-400 self-center">Esta foto aparece cuando Julieta presenta el {form.product_type} al cliente.</p>
                          )}
                          {main && (
                            <label className="h-28 w-28 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors shrink-0">
                              <span className="text-xl">🔄</span>
                              <span className="text-xs text-gray-400 mt-1 text-center">Cambiar</span>
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(editing.id, f, true); }} />
                            </label>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">🖼️ Fotos adicionales <span className="text-xs text-gray-400 font-normal">máx. 3 — Julieta las envía si el cliente pide ver más</span></p>
                    <div className="flex gap-2 flex-wrap">
                      {editing.images.filter(i => i.is_main !== 1).map(img => (
                        <div key={img.id} className="relative group">
                          <img src={`/api/uploads/products/${img.filename}`} className="h-20 w-20 object-cover rounded-lg border" />
                          <button onClick={() => deleteImage(editing.id, img.id)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                      ))}
                      {editing.images.filter(i => i.is_main !== 1).length < 3 && (
                        <label className="h-20 w-20 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                          {uploading ? <span className="text-xs text-gray-400">...</span> : <>
                            <span className="text-xl text-gray-400">+</span>
                            <span className="text-[10px] text-gray-400">Agregar</span>
                          </>}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(editing.id, f, false); }} />
                        </label>
                      )}
                      {editing.images.filter(i => i.is_main !== 1).length === 0 && (
                        <p className="text-xs text-gray-400 self-center">Ninguna aún.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!editing && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                  💡 Después de crear, podrás agregar las fotos del {form.product_type}.
                </div>
              )}

              {/* Instrucciones IA */}
              <div>
                <label className="text-sm font-medium text-gray-700">Instrucciones para Julieta</label>
                <p className="text-xs text-gray-400 mb-1">Julieta usará esto para responder preguntas específicas sobre este {form.product_type}.</p>
                <textarea value={form.ai_instructions ?? ""} onChange={e => setForm({...form, ai_instructions: e.target.value})}
                  rows={3} placeholder={`Incluye... No incluye... Duración... Preguntas frecuentes...`}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>

              {/* Activo */}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active" checked={form.active === 1} onChange={e => setForm({...form, active: e.target.checked ? 1 : 0})} />
                <label htmlFor="active" className="text-sm text-gray-700">Activo (visible para Julieta y el bot)</label>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 border rounded-lg py-2 text-sm">
                  {editing ? "Cerrar" : "Cancelar"}
                </button>
                <button onClick={save} disabled={!form.name}
                  className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                  {editing ? "Guardar cambios" : `Crear ${form.product_type}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal importar CSV/Excel ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex justify-between items-center">
              <div>
                <h2 className="font-bold text-gray-800">Importar productos</h2>
                <p className="text-xs text-gray-400">Desde archivo o capturas de pantalla con IA</p>
              </div>
              <button onClick={closeImport} className="text-gray-400 text-2xl leading-none">×</button>
            </div>

            {/* Tabs */}
            {!importResult && (
              <div className="flex border-b px-5">
                <button onClick={() => { setImportMode("file"); setVisionPreview(null); setImportPreview(null); }}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${importMode === "file" ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  📄 CSV / Excel
                </button>
                <button onClick={() => { setImportMode("vision"); setImportPreview(null); setVisionPreview(null); }}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${importMode === "vision" ? "border-emerald-500 text-emerald-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  📸 Fotos / Capturas con IA
                </button>
              </div>
            )}

            <div className="p-5 space-y-5">
              {/* Instrucciones CSV */}
              {importMode === "file" && !importPreview && !importResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
                  <p className="font-semibold">Cómo exportar desde WhatsApp Business (Android):</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Abre WhatsApp Business → Catálogo (ícono de tienda)</li>
                    <li>Toca los 3 puntos ⋮ → &ldquo;Compartir catálogo&rdquo;</li>
                    <li>Selecciona &ldquo;Exportar como CSV&rdquo; o descarga el Excel</li>
                    <li>Sube ese archivo aquí</li>
                  </ol>
                  <p className="text-xs text-blue-600 mt-1">También funciona con cualquier Excel o CSV con columnas: <strong>nombre, precio, descripción</strong>.</p>
                </div>
              )}

              {/* Resultado de importación exitosa */}
              {importResult && (
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">✅</div>
                  <p className="text-xl font-bold text-gray-800">{importResult.imported} productos importados</p>
                  {importResult.skipped > 0 && <p className="text-sm text-gray-500 mt-1">{importResult.skipped} omitidos (ya existían con el mismo nombre)</p>}
                  {(importErrors.length > 0 || visionErrors.length > 0) && (
                    <div className="mt-3 text-left bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-1">Advertencias:</p>
                      {[...importErrors, ...visionErrors].map((e, i) => <p key={i} className="text-xs text-orange-600">{e}</p>)}
                    </div>
                  )}
                  <button onClick={closeImport} className="mt-5 bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
                    Cerrar y ver productos
                  </button>
                </div>
              )}

              {/* ── Panel CSV/Excel ── */}
              {!importResult && importMode === "file" && (
                <>
                  <div>
                    <label
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                    >
                      <span className="text-3xl mb-2">📂</span>
                      <span className="text-sm text-gray-600 font-medium">{importFile ? importFile.name : "Arrastra tu archivo o haz clic"}</span>
                      <span className="text-xs text-gray-400 mt-1">CSV · XLSX · XLS</span>
                      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
                    </label>
                  </div>
                  {importColumns.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">Columnas detectadas:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {importColumns.map(c => <span key={c} className="text-xs bg-white border rounded-full px-2 py-0.5 text-gray-600">{c}</span>)}
                      </div>
                    </div>
                  )}
                  {importErrors.length > 0 && !importPreview && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">Errores:</p>
                      {importErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                    </div>
                  )}
                  {importPreview && importPreview.length > 0 && <PreviewTable rows={importPreview} total={importTotal} errors={importErrors} />}
                  {importPreview !== null && importPreview.length === 0 && (
                    <p className="text-center py-4 text-gray-400 text-sm">No se encontraron productos válidos.</p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={closeImport} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancelar</button>
                    <button onClick={confirmImport} disabled={!importPreview || importPreview.length === 0 || importing}
                      className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                      {importing ? "Importando..." : `Importar ${importTotal} producto${importTotal !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </>
              )}

              {/* ── Panel Fotos / IA ── */}
              {!importResult && importMode === "vision" && (
                <>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-800 space-y-2">
                    <p className="font-semibold">Cómo hacerlo desde iPhone:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Abre WhatsApp Business → ve a tu Catálogo</li>
                      <li>Haz <strong>captura de pantalla</strong> de cada producto (o de la lista completa)</li>
                      <li>Sube las capturas aquí — la IA leerá nombre, precio y descripción</li>
                    </ol>
                    <p className="text-xs text-purple-600">También funciona con fotos de catálogos físicos, PDF fotografiados o cualquier imagen de lista de precios.</p>
                  </div>

                  <div>
                    <label
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-purple-300 rounded-xl cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-colors"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); handleVisionFiles(e.dataTransfer.files); }}
                    >
                      <span className="text-3xl mb-2">📸</span>
                      <span className="text-sm text-gray-600 font-medium">
                        {visionFiles.length > 0 ? `${visionFiles.length} imagen${visionFiles.length !== 1 ? "es" : ""} seleccionada${visionFiles.length !== 1 ? "s" : ""}` : "Selecciona hasta 10 imágenes"}
                      </span>
                      <span className="text-xs text-gray-400 mt-1">JPG · PNG · HEIC · WebP</span>
                      <input ref={visionInputRef} type="file" accept="image/*" multiple className="hidden"
                        onChange={e => { if (e.target.files) handleVisionFiles(e.target.files); }} />
                    </label>
                  </div>

                  {visionLoading && (
                    <div className="flex items-center justify-center gap-3 py-4">
                      <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                      <p className="text-sm text-purple-700">La IA está leyendo tus imágenes...</p>
                    </div>
                  )}

                  {visionErrors.length > 0 && !visionPreview && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">Errores:</p>
                      {visionErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                    </div>
                  )}

                  {visionPreview && visionPreview.length > 0 && <PreviewTable rows={visionPreview} total={visionTotal} errors={visionErrors} />}
                  {visionPreview !== null && !visionLoading && visionPreview.length === 0 && (
                    <p className="text-center py-4 text-gray-400 text-sm">La IA no encontró productos en las imágenes. Intenta con capturas más claras.</p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button onClick={closeImport} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancelar</button>
                    <button onClick={confirmVisionImport} disabled={!visionPreview || visionPreview.length === 0 || importing || visionLoading}
                      className="flex-1 bg-purple-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                      {importing ? "Importando..." : `Importar ${visionTotal} producto${visionTotal !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
