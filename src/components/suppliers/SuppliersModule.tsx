"use client";
import { useState, useEffect } from "react";

interface Supplier { id: number; name: string; nit: string | null; email: string | null; phone: string | null; contact_person: string | null; rnt: string | null; active: number }
interface SupplierBank { id: number; bank_name: string; account_type: string; account_number: string; account_holder: string | null }
interface SupplierDoc { id: number; doc_type: string; filename: string; original_name: string | null; created_at: number }

const EMPTY: Omit<Supplier, "id" | "active"> = { name: "", nit: "", email: "", phone: "", contact_person: "", rnt: "" };

export default function SuppliersModule() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ supplier: Supplier; banks: SupplierBank[]; documents: SupplierDoc[] } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [newBank, setNewBank] = useState({ bank_name: "", account_type: "ahorros", account_number: "", account_holder: "" });
  const [uploading, setUploading] = useState(false);

  async function fetchList() {
    const r = await fetch("/api/suppliers"); if (r.ok) setSuppliers((await r.json()).suppliers);
  }
  async function fetchDetail(id: number) {
    const r = await fetch(`/api/suppliers/${id}`); if (r.ok) setDetail(await r.json());
  }
  useEffect(() => { fetchList(); }, []);
  useEffect(() => { if (selected) fetchDetail(selected); else setDetail(null); }, [selected]);

  async function save() {
    const method = editing ? "PATCH" : "POST";
    const url    = editing ? `/api/suppliers/${editing.id}` : "/api/suppliers";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); setEditing(null); fetchList();
    if (selected) fetchDetail(selected);
  }
  async function addBank() {
    if (!newBank.bank_name || !newBank.account_number) return;
    await fetch(`/api/suppliers/${selected}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBank) });
    setNewBank({ bank_name: "", account_type: "ahorros", account_number: "", account_holder: "" });
    if (selected) fetchDetail(selected);
  }
  async function removeBank(bankId: number) {
    await fetch(`/api/suppliers/${selected}/documents`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank_id: bankId }) });
    if (selected) fetchDetail(selected);
  }
  async function uploadDoc(file: File, docType: string) {
    setUploading(true);
    const fd = new FormData(); fd.append("file", file); fd.append("doc_type", docType);
    await fetch(`/api/suppliers/${selected}/documents`, { method: "POST", body: fd });
    setUploading(false); if (selected) fetchDetail(selected);
  }
  async function removeDoc(docId: number) {
    await fetch(`/api/suppliers/${selected}/documents`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc_id: docId }) });
    if (selected) fetchDetail(selected);
  }

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setShowForm(true); }
  function openEdit(s: Supplier) { setEditing(s); setForm({ name: s.name, nit: s.nit ?? "", email: s.email ?? "", phone: s.phone ?? "", contact_person: s.contact_person ?? "", rnt: s.rnt ?? "" }); setShowForm(true); }

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Lista */}
      <div className="w-72 shrink-0 border-r bg-white flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Proveedores</h2>
          <button onClick={openNew} className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-medium">+ Nuevo</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {suppliers.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Sin proveedores.</p>}
          {suppliers.map((s) => (
            <button key={s.id} onClick={() => setSelected(s.id)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${selected === s.id ? "bg-emerald-50 border-l-2 border-l-emerald-500" : ""}`}>
              <p className="font-medium text-sm text-gray-800">{s.name}</p>
              <p className="text-xs text-gray-400">{s.nit ? `NIT: ${s.nit}` : ""} {s.rnt ? `· RNT: ${s.rnt}` : ""}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {!detail && (
          <div className="flex h-full items-center justify-center text-gray-400 text-sm">Selecciona un proveedor</div>
        )}
        {detail && (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800">{detail.supplier.name}</h1>
                <div className="flex gap-3 text-sm text-gray-500 mt-1 flex-wrap">
                  {detail.supplier.nit && <span>NIT: {detail.supplier.nit}</span>}
                  {detail.supplier.rnt && <span>RNT: {detail.supplier.rnt}</span>}
                  {detail.supplier.email && <span>{detail.supplier.email}</span>}
                  {detail.supplier.phone && <span>{detail.supplier.phone}</span>}
                </div>
              </div>
              <button onClick={() => openEdit(detail.supplier)} className="text-sm text-blue-500 hover:text-blue-700">Editar</button>
            </div>

            {/* Documentos */}
            <div className="bg-white border rounded-xl p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Documentos legales</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {(["rut", "camara_comercio"] as const).map((type) => {
                  const doc = detail.documents.find((d) => d.doc_type === type);
                  return (
                    <div key={type} className={`border-2 border-dashed rounded-xl p-3 ${doc ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`}>
                      <p className="text-xs font-medium text-gray-600 mb-2">{type === "rut" ? "RUT" : "Cámara de Comercio"}</p>
                      {doc ? (
                        <div className="flex items-center justify-between">
                          <a href={`/uploads/supplier-docs/${doc.filename}`} target="_blank" rel="noopener" className="text-xs text-emerald-600 underline truncate flex-1">{doc.original_name ?? doc.filename}</a>
                          <button onClick={() => removeDoc(doc.id)} className="text-red-400 text-xs ml-2">×</button>
                        </div>
                      ) : (
                        <label className="cursor-pointer text-xs text-gray-400 hover:text-emerald-600">
                          + Subir PDF {uploading ? "(cargando...)" : ""}
                          <input type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0], type)} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cuentas bancarias */}
            <div className="bg-white border rounded-xl p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Cuentas bancarias</h3>
              <div className="space-y-2 mb-3">
                {detail.banks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-sm">{b.bank_name}</span>
                      <span className="text-gray-400 text-sm ml-2">· {b.account_type === "corriente" ? "Cta. Cte." : "Cta. Ahorro"} {b.account_number}</span>
                      {b.account_holder && <span className="text-gray-400 text-xs ml-1">({b.account_holder})</span>}
                    </div>
                    <button onClick={() => removeBank(b.id)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                  </div>
                ))}
                {detail.banks.length === 0 && <p className="text-gray-400 text-sm">Sin cuentas registradas.</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Banco" value={newBank.bank_name} onChange={(e) => setNewBank({...newBank, bank_name: e.target.value})} className="border rounded px-2 py-1.5 text-sm" />
                <select value={newBank.account_type} onChange={(e) => setNewBank({...newBank, account_type: e.target.value})} className="border rounded px-2 py-1.5 text-sm">
                  <option value="ahorros">Ahorros</option><option value="corriente">Corriente</option>
                </select>
                <input placeholder="Número de cuenta" value={newBank.account_number} onChange={(e) => setNewBank({...newBank, account_number: e.target.value})} className="border rounded px-2 py-1.5 text-sm" />
                <input placeholder="Titular" value={newBank.account_holder} onChange={(e) => setNewBank({...newBank, account_holder: e.target.value})} className="border rounded px-2 py-1.5 text-sm" />
              </div>
              <button onClick={addBank} className="mt-2 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-600">+ Agregar cuenta</button>
            </div>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800">{editing ? "Editar proveedor" : "Nuevo proveedor"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {([["name","Nombre *"],["nit","NIT"],["email","Correo"],["phone","Teléfono"],["contact_person","Persona de contacto"],["rnt","Número RNT"]] as [string, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="text-sm font-medium text-gray-700">{label}</label>
                  <input value={(form as Record<string, string>)[key] ?? ""} onChange={(e) => setForm({...form, [key]: e.target.value})} className="w-full border rounded-lg px-3 py-2 mt-1 text-sm" />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>
                <button onClick={save} disabled={!form.name} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                  {editing ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
