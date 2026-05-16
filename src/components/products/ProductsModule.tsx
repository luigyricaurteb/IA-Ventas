"use client";

import { useState, useEffect } from "react";

interface ProductImage { id: number; filename: string; order_index: number }
interface Product {
  id: number; name: string; description: string | null;
  price_per_person: number; ai_instructions: string | null;
  active: number; images: ProductImage[];
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

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Productos & Servicios</h1>
        <button onClick={openNew} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600">
          + Nuevo producto
        </button>
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
    </div>
  );
}
