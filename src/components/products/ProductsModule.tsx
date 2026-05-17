"use client";

import { useState, useEffect, useRef } from "react";

interface ProductImage { id: number; filename: string; order_index: number }
interface Product {
  id: number; name: string; description: string | null;
  price_per_person: number; ai_instructions: string | null;
  active: number; images: ProductImage[];
}
interface ImportPreview {
  name: string; description: string | null;
  price_per_person: number; ai_instructions: string | null;
}

const EMPTY: Omit<Product, "id" | "images"> = {
  name: "", description: "", price_per_person: 0, ai_instructions: "", active: 1,
};

export default function ProductsModule() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview[] | null>(null);
  const [importTotal, setImportTotal] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetch_() {
    const res = await fetch("/api/products");
    if (res.ok) setProducts((await res.json()).products);
  }
  useEffect(() => { fetch_(); }, []);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowForm(true); }
  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "", price_per_person: p.price_per_person, ai_instructions: p.ai_instructions ?? "", active: p.active });
    setShowForm(true);
  }

  async function save() {
    const method = editing ? "PATCH" : "POST";
    const url = editing ? `/api/products/${editing.id}` : "/api/products";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false);
    fetch_();
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este producto?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    fetch_();
  }

  async function uploadImage(productId: number, file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    await fetch(`/api/products/${productId}/images`, { method: "POST", body: fd });
    setUploading(false);
    fetch_();
  }

  async function deleteImage(productId: number, imageId: number) {
    await fetch(`/api/products/${productId}/images`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId }),
    });
    fetch_();
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Productos & Servicios</h1>
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
        {products.map((p) => (
          <div key={p.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!p.active ? "opacity-60" : ""}`}>
            {p.images.length > 0 && (
              <div className="flex gap-1 p-2 bg-gray-50 overflow-x-auto">
                {p.images.map((img) => (
                  <div key={img.id} className="relative group shrink-0">
                    <img src={`/uploads/products/${img.filename}`} className="h-20 w-20 object-cover rounded" />
                    <button
                      onClick={() => deleteImage(p.id, img.id)}
                      className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded px-1 opacity-0 group-hover:opacity-100"
                    >×</button>
                  </div>
                ))}
                <label className="h-20 w-20 border-2 border-dashed border-gray-200 rounded flex items-center justify-center cursor-pointer hover:border-emerald-400 shrink-0">
                  {uploading ? "..." : "+"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(p.id, e.target.files[0])} />
                </label>
              </div>
            )}
            {p.images.length === 0 && (
              <label className="flex items-center justify-center h-24 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                <span className="text-gray-400 text-sm">+ Agregar foto</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(p.id, e.target.files[0])} />
              </label>
            )}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-800">{p.name}</h3>
                {!p.active && <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded">Inactivo</span>}
              </div>
              {p.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
              <p className="text-emerald-600 font-bold mt-2">${p.price_per_person.toLocaleString("es-CO")} / persona</p>
              {p.ai_instructions && (
                <details className="mt-2">
                  <summary className="text-xs text-blue-500 cursor-pointer">Ver instrucciones IA</summary>
                  <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{p.ai_instructions}</p>
                </details>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={() => openEdit(p)} className="flex-1 text-sm border rounded-lg py-1.5 hover:bg-gray-50">Editar</button>
                <button onClick={() => remove(p.id)} className="text-sm text-red-400 hover:text-red-600 px-2">Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="font-bold text-gray-800">{editing ? "Editar producto" : "Nuevo producto"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Descripción</label>
                <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Precio por persona (COP) *</label>
                <input type="number" value={form.price_per_person} onChange={(e) => setForm({ ...form, price_per_person: Number(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Instrucciones para la IA</label>
                <p className="text-xs text-gray-400 mb-1">La IA usará esto para responder preguntas sobre este producto.</p>
                <textarea value={form.ai_instructions ?? ""} onChange={(e) => setForm({ ...form, ai_instructions: e.target.value })}
                  rows={4} placeholder="Ej: Este paquete incluye... No incluye... Preguntas frecuentes..."
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.active === 1} onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} id="active" />
                <label htmlFor="active" className="text-sm text-gray-700">Activo (visible para el bot)</label>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={save} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600">
                  {editing ? "Guardar cambios" : "Crear producto"}
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
                <p className="text-xs text-gray-400">CSV, XLSX o XLS — exportado de WhatsApp Business, Excel o cualquier sistema</p>
              </div>
              <button onClick={closeImport} className="text-gray-400 text-2xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Instrucciones */}
              {!importPreview && !importResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
                  <p className="font-semibold">Cómo exportar desde WhatsApp Business:</p>
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
                  {importErrors.length > 0 && (
                    <div className="mt-3 text-left bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-1">Advertencias:</p>
                      {importErrors.map((e, i) => <p key={i} className="text-xs text-orange-600">{e}</p>)}
                    </div>
                  )}
                  <button onClick={closeImport} className="mt-5 bg-emerald-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
                    Cerrar y ver productos
                  </button>
                </div>
              )}

              {/* Zona de subida */}
              {!importResult && (
                <>
                  <div>
                    <label
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                    >
                      <span className="text-3xl mb-2">📂</span>
                      <span className="text-sm text-gray-600 font-medium">{importFile ? importFile.name : "Arrastra tu archivo o haz clic para seleccionar"}</span>
                      <span className="text-xs text-gray-400 mt-1">CSV · XLSX · XLS</span>
                      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
                    </label>
                  </div>

                  {/* Columnas detectadas */}
                  {importColumns.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">Columnas detectadas en el archivo:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {importColumns.map(c => <span key={c} className="text-xs bg-white border rounded-full px-2 py-0.5 text-gray-600">{c}</span>)}
                      </div>
                    </div>
                  )}

                  {/* Errores de parseo */}
                  {importErrors.length > 0 && !importPreview && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">Errores:</p>
                      {importErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                    </div>
                  )}

                  {/* Preview */}
                  {importPreview && importPreview.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-700">
                          Vista previa — {importTotal} producto{importTotal !== 1 ? "s" : ""} encontrado{importTotal !== 1 ? "s" : ""}
                        </p>
                        {importTotal > 10 && <span className="text-xs text-gray-400">Mostrando primeros 10</span>}
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
                            {importPreview.map((p, i) => (
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
                      {importErrors.length > 0 && (
                        <div className="mt-2 bg-orange-50 border border-orange-200 rounded-xl p-3">
                          <p className="text-xs font-semibold text-orange-700 mb-1">Advertencias:</p>
                          {importErrors.slice(0,5).map((e, i) => <p key={i} className="text-xs text-orange-600">{e}</p>)}
                        </div>
                      )}
                    </div>
                  )}

                  {importPreview !== null && importPreview.length === 0 && (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      No se encontraron productos válidos en el archivo.
                    </div>
                  )}

                  {/* Botones */}
                  <div className="flex gap-2 pt-2">
                    <button onClick={closeImport} className="flex-1 border rounded-lg py-2 text-sm text-gray-600">Cancelar</button>
                    <button
                      onClick={confirmImport}
                      disabled={!importPreview || importPreview.length === 0 || importing}
                      className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {importing ? "Importando..." : `Importar ${importTotal} producto${importTotal !== 1 ? "s" : ""}`}
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
