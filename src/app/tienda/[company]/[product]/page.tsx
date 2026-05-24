"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface ProductData {
  company: { name: string; slug: string; logo_filename: string | null };
  product: {
    id: number; name: string; description: string | null;
    price_per_person: number; product_type: string; images: string[];
  };
  payment: {
    method: string;
    banks: { bank_name: string; account_type: string; account_number: string; account_holder: string | null }[];
    nequi_phone: string | null;
    daviplata_phone: string | null;
  };
  ai_name: string;
}

export default function ProductPage() {
  const params = useParams() as { company: string; product: string };
  const [data, setData]       = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [people, setPeople]   = useState(1);
  const [step, setStep]       = useState<"info" | "form" | "done">("info");
  const [form, setForm]       = useState({ name: "", phone: "", notes: "" });
  const [proof, setProof]     = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{ total: number; phone: string } | null>(null);
  const [imgIdx, setImgIdx]   = useState(0);

  useEffect(() => {
    fetch(`/api/public/products/${params.company}/${params.product}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("No se pudo cargar el producto"))
      .finally(() => setLoading(false));
  }, [params.company, params.product]);

  async function handleOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.append("name", form.name);
    fd.append("phone", form.phone);
    fd.append("people", String(people));
    fd.append("notes", form.notes);
    if (proof) fd.append("proof", proof);
    const res = await fetch(`/api/public/products/${params.company}/${params.product}/order`, { method: "POST", body: fd });
    const d = await res.json();
    setSubmitting(false);
    if (res.ok) { setOrderResult(d); setStep("done"); }
    else alert(d.error ?? "Error al enviar pedido");
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
      <div className="text-center"><div className="text-5xl mb-4">😕</div><p className="text-gray-300">{error}</p></div>
    </div>
  );
  if (!data) return null;

  const { company, product, payment, ai_name } = data;
  const total = product.price_per_person * people;
  const hasImages = product.images.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-sm">
          {company.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{company.name}</p>
          <p className="text-gray-400 text-xs">Tienda en línea</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {step === "info" && (
          <>
            {/* Galería de imágenes */}
            {hasImages && (
              <div className="relative">
                <img
                  src={product.images[imgIdx]}
                  alt={product.name}
                  className="w-full h-64 object-cover rounded-2xl"
                />
                {product.images.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {product.images.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${i === imgIdx ? "bg-white" : "bg-white/40"}`} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Info del producto */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h1 className="text-2xl font-bold text-white">{product.name}</h1>
                <span className="text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-700 px-2 py-1 rounded-full shrink-0">
                  {product.product_type}
                </span>
              </div>
              {product.description && (
                <p className="text-gray-300 text-sm leading-relaxed">{product.description}</p>
              )}
            </div>

            {/* Calculadora de precio */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-4">Cotizador</p>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white font-medium">Precio por persona</p>
                  <p className="text-2xl font-bold text-emerald-400">${product.price_per_person.toLocaleString("es-CO")} COP</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <label className="text-gray-400 text-sm">Personas:</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPeople(p => Math.max(1, p - 1))}
                    className="w-8 h-8 bg-gray-700 rounded-lg text-white font-bold hover:bg-gray-600 transition-colors">-</button>
                  <span className="text-white font-bold text-lg w-8 text-center">{people}</span>
                  <button onClick={() => setPeople(p => p + 1)}
                    className="w-8 h-8 bg-gray-700 rounded-lg text-white font-bold hover:bg-gray-600 transition-colors">+</button>
                </div>
              </div>
              <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
                <p className="text-gray-400 text-sm">Total</p>
                <p className="text-2xl font-bold text-white">${total.toLocaleString("es-CO")} COP</p>
              </div>
            </div>

            {/* Métodos de pago */}
            {(payment.banks.length > 0 || payment.nequi_phone || payment.daviplata_phone) && (
              <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-4">Métodos de pago</p>
                <div className="space-y-3">
                  {payment.banks.map((b, i) => (
                    <div key={i} className="bg-gray-700/50 rounded-xl p-3">
                      <p className="text-white font-medium text-sm">🏦 {b.bank_name}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        {b.account_type === "corriente" ? "Cta. Corriente" : "Cta. Ahorros"}: {b.account_number}
                      </p>
                      {b.account_holder && <p className="text-gray-400 text-xs">A nombre de: {b.account_holder}</p>}
                    </div>
                  ))}
                  {payment.nequi_phone && (
                    <div className="bg-gray-700/50 rounded-xl p-3">
                      <p className="text-white font-medium text-sm">💜 Nequi</p>
                      <p className="text-gray-400 text-xs mt-1">{payment.nequi_phone}</p>
                    </div>
                  )}
                  {payment.daviplata_phone && (
                    <div className="bg-gray-700/50 rounded-xl p-3">
                      <p className="text-white font-medium text-sm">🔴 DaviPlata</p>
                      <p className="text-gray-400 text-xs mt-1">{payment.daviplata_phone}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button onClick={() => setStep("form")}
              className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 transition-colors">
              Reservar ahora →
            </button>

            <p className="text-center text-gray-500 text-xs">
              {ai_name} te acompañará en todo el proceso por WhatsApp.
            </p>
          </>
        )}

        {step === "form" && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("info")} className="text-gray-400 hover:text-white">←</button>
              <h2 className="text-white font-semibold">Completa tu pedido</h2>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
              <p className="text-white font-medium">{product.name}</p>
              <p className="text-gray-400 text-sm">{people} persona{people !== 1 ? "s" : ""} · <span className="text-emerald-400 font-semibold">${total.toLocaleString("es-CO")} COP</span></p>
            </div>

            <form onSubmit={handleOrder} className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Tu nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nombre completo" required
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">WhatsApp *</label>
                <div className="flex gap-2">
                  <span className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-gray-400 text-sm">+57</span>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="3001234567" required type="tel"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5">Notas adicionales (opcional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Fecha preferida, detalles especiales..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none" />
              </div>

              {(payment.banks.length > 0 || payment.nequi_phone) && (
                <div>
                  <label className="text-gray-400 text-xs block mb-1.5">Comprobante de pago (opcional)</label>
                  <label className="flex items-center gap-3 bg-gray-800 border border-gray-700 border-dashed rounded-xl p-4 cursor-pointer hover:border-emerald-500 transition-colors">
                    <span className="text-2xl">{proof ? "✅" : "📎"}</span>
                    <div>
                      <p className="text-white text-sm">{proof ? proof.name : "Subir comprobante"}</p>
                      <p className="text-gray-500 text-xs">JPG, PNG o PDF · máx 10 MB</p>
                    </div>
                    <input type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => setProof(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}

              <button type="submit" disabled={submitting}
                className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
                {submitting ? "Enviando..." : "Confirmar pedido →"}
              </button>
            </form>
          </>
        )}

        {step === "done" && orderResult && (
          <div className="text-center py-10">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">¡Pedido recibido!</h2>
            <p className="text-gray-400 mb-6">
              Total: <span className="text-emerald-400 font-bold">${orderResult.total.toLocaleString("es-CO")} COP</span>
            </p>
            <p className="text-gray-300 text-sm mb-6">
              {ai_name} te contactará por WhatsApp al número registrado para confirmar tu reserva.
            </p>
            <a href={`https://wa.me/${orderResult.phone}`}
              className="inline-block bg-green-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-600 transition-colors">
              💬 Abrir WhatsApp
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
