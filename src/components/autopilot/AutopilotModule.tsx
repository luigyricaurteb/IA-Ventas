"use client";
import { useState, useEffect, useRef } from "react";

interface AutoImage { id: number; filename: string; original_name: string | null; order_index: number }
interface AutoPost {
  id: number; caption: string; hashtags: string | null; platform: string;
  status: string; image_filename: string | null; image_name: string | null;
  published_at: number | null; fb_post_id: string | null; ig_post_id: string | null;
  fb_likes: number; ig_likes: number;
  error_msg: string | null; created_at: number;
}
interface AutoConfig {
  enabled: number; tone: string; frequency: string; posting_hour: number;
  publish_facebook: number; publish_instagram: number; auto_approve: number;
}

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", approved: "Aprobado", published: "Publicado", failed: "Error"
};
const TONES = [
  { value: "profesional", label: "💼 Profesional" },
  { value: "casual", label: "😊 Casual" },
  { value: "entretenido", label: "🎉 Entretenido" },
  { value: "informativo", label: "📚 Informativo" },
];
const FREQUENCIES = [
  { value: "daily", label: "1 post / día" },
  { value: "5week", label: "5 posts / semana" },
  { value: "3week", label: "3 posts / semana" },
  { value: "weekly", label: "1 post / semana" },
];

export default function AutopilotModule() {
  const [tab, setTab] = useState<"config"|"images"|"queue"|"published">("images");
  const [config, setConfig] = useState<AutoConfig>({ enabled: 0, tone: "profesional", frequency: "3week", posting_hour: 9, publish_facebook: 1, publish_instagram: 1, auto_approve: 0 });
  const [images, setImages] = useState<AutoImage[]>([]);
  const [posts, setPosts] = useState<AutoPost[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [generatedPost, setGeneratedPost] = useState<{ caption: string; hashtags: string; imageId: number | null } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadConfig() {
    const d = await fetch("/api/autopilot/config").then(r => r.json()) as { config: AutoConfig };
    if (d.config) setConfig(d.config);
  }
  async function loadImages() {
    const d = await fetch("/api/autopilot/images").then(r => r.json()) as { images: AutoImage[] };
    setImages(d.images ?? []);
  }
  async function loadPosts(status = "") {
    const url = status ? `/api/autopilot/posts?status=${status}` : "/api/autopilot/posts";
    const d = await fetch(url).then(r => r.json()) as { posts: AutoPost[] };
    setPosts(d.posts ?? []);
  }

  useEffect(() => { loadConfig(); loadImages(); loadPosts(); }, []);
  useEffect(() => {
    if (tab === "queue") loadPosts("draft");
    else if (tab === "published") loadPosts("published");
    else if (tab === "images") loadImages();
  }, [tab]);

  async function saveConfig() {
    setSaving(true);
    await fetch("/api/autopilot/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    setSaving(false);
    showMsg(true, "Configuración guardada");
  }

  async function uploadImage(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    await fetch("/api/autopilot/images", { method: "POST", body: fd });
    await loadImages();
    setUploading(false);
  }

  async function deleteImage(id: number) {
    if (!confirm("¿Eliminar esta imagen?")) return;
    await fetch(`/api/autopilot/images/${id}`, { method: "DELETE" });
    setImages(prev => prev.filter(i => i.id !== id));
  }

  // Drag & drop reorder
  function onDragStart(id: number) { setDragging(id); }
  function onDragOver(e: React.DragEvent, id: number) { e.preventDefault(); setDragOver(id); }
  async function onDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault();
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return; }
    const newOrder = [...images];
    const fromIdx = newOrder.findIndex(i => i.id === dragging);
    const toIdx = newOrder.findIndex(i => i.id === targetId);
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    setImages(newOrder);
    setDragging(null); setDragOver(null);
    await fetch("/api/autopilot/images/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: newOrder.map(i => i.id) }) });
  }

  async function generate() {
    setGenerating(true); setGeneratedPost(null);
    const imageId = images[0]?.id ?? null;
    const res = await fetch("/api/autopilot/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId, customPrompt: customPrompt.trim() || undefined }),
    });
    const d = await res.json() as { caption?: string; hashtags?: string; error?: string };
    if (d.caption) {
      setGeneratedPost({ caption: d.caption, hashtags: d.hashtags ?? "", imageId });
      setCustomPrompt("");
    } else showMsg(false, d.error ?? "Error al generar");
    setGenerating(false);
  }

  async function savePost() {
    if (!generatedPost) return;
    await fetch("/api/autopilot/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: generatedPost.caption, hashtags: generatedPost.hashtags, image_id: generatedPost.imageId, platform: "both" }),
    });
    setGeneratedPost(null);
    showMsg(true, "Post guardado en la cola");
    loadPosts("draft");
    if (tab !== "queue") setTab("queue");
  }

  async function approvePost(id: number) {
    await fetch(`/api/autopilot/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
    loadPosts("draft");
  }

  async function publishPost(id: number) {
    setPublishing(id);
    const res = await fetch(`/api/autopilot/posts/${id}`, { method: "POST" });
    const d = await res.json() as { ok: boolean; errors?: string[] };
    if (d.ok) showMsg(true, "✅ Publicado en redes sociales");
    else showMsg(false, `❌ ${d.errors?.join(", ") ?? "Error al publicar"}`);
    setPublishing(null);
    loadPosts(tab === "published" ? "published" : "draft");
  }

  async function deletePost(id: number) {
    if (!confirm("¿Eliminar este post?")) return;
    await fetch(`/api/autopilot/posts/${id}`, { method: "DELETE" });
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  function showMsg(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }

  const TABS = [
    { id: "images" as const, label: "🖼️ Banco de imágenes" },
    { id: "queue" as const, label: "📋 Cola de publicación" },
    { id: "published" as const, label: "✅ Publicados" },
    { id: "config" as const, label: "⚙️ Configuración" },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🤖 Autopilot</h1>
          <p className="text-sm text-gray-400">Sube imágenes, genera texto con IA y publica automáticamente en Facebook e Instagram — sin esfuerzo manual.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && (
            <span className={`text-sm px-3 py-1.5 rounded-lg font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {msg.text}
            </span>
          )}
          <button onClick={generate} disabled={generating}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            style={{ background: "#0077b6" }}>
            {generating ? "Generando..." : "✨ Generar post"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b bg-white px-4">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.id ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── BANCO DE IMÁGENES ── */}
        {tab === "images" && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">Banco de imágenes</h2>
                <p className="text-sm text-gray-500 mt-0.5">Arrastra para cambiar el orden. Se publicarán en este orden de forma rotativa.</p>
              </div>
              <label className="cursor-pointer text-white px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "#0077b6" }}>
                {uploading ? "Subiendo..." : "+ Subir imagen"}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={async e => {
                    const files = Array.from(e.target.files ?? []);
                    for (const f of files) await uploadImage(f);
                    e.target.value = "";
                  }} />
              </label>
            </div>

            {images.length === 0 && (
              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <span className="text-4xl mb-2">🖼️</span>
                <p className="text-gray-500 text-sm">Sube tus primeras imágenes</p>
                <p className="text-gray-400 text-xs mt-1">JPG, PNG, WebP</p>
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={async e => { const files = Array.from(e.target.files ?? []); for (const f of files) await uploadImage(f); }} />
              </label>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {images.map((img, idx) => (
                <div key={img.id}
                  draggable
                  onDragStart={() => onDragStart(img.id)}
                  onDragOver={e => onDragOver(e, img.id)}
                  onDrop={e => onDrop(e, img.id)}
                  onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  className={`relative group border-2 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all ${dragOver === img.id ? "border-blue-400 scale-105" : "border-gray-200"} ${dragging === img.id ? "opacity-50" : ""}`}>
                  <img src={`/api/uploads/autopilot/${img.filename}`} className="w-full h-36 object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">
                    {idx + 1}
                  </div>
                  <button onClick={() => deleteImage(img.id)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none">
                    ×
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-white text-xs truncate">{img.original_name ?? img.filename}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── COLA DE PUBLICACIÓN ── */}
        {tab === "queue" && (
          <div className="space-y-4 max-w-3xl">
            {/* Generador */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5">
              <h3 className="font-semibold text-gray-800 mb-3">✨ Generar nuevo post con IA</h3>
              <div className="flex gap-2">
                <input value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="Opcional: indica el tema o especificación del post..."
                  className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                <button onClick={generate} disabled={generating}
                  className="text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                  style={{ background: "#0077b6" }}>
                  {generating ? "..." : "Generar"}
                </button>
              </div>

              {generatedPost && (
                <div className="mt-4 bg-white rounded-xl p-4 border">
                  <div className="flex gap-4">
                    {generatedPost.imageId && images.find(i => i.id === generatedPost.imageId) && (
                      <img src={`/api/uploads/autopilot/${images.find(i => i.id === generatedPost.imageId)?.filename}`}
                        className="w-24 h-24 object-cover rounded-lg shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <textarea value={generatedPost.caption}
                        onChange={e => setGeneratedPost({...generatedPost, caption: e.target.value})}
                        rows={3} className="w-full text-sm border rounded-lg p-2 resize-none mb-2" />
                      <input value={generatedPost.hashtags}
                        onChange={e => setGeneratedPost({...generatedPost, hashtags: e.target.value})}
                        className="w-full text-xs text-blue-600 border rounded-lg px-2 py-1" placeholder="#hashtags" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setGeneratedPost(null)} className="flex-1 border rounded-lg py-2 text-sm">Descartar</button>
                    <button onClick={savePost} className="flex-1 text-white rounded-lg py-2 text-sm font-medium" style={{ background: "#0077b6" }}>
                      Guardar en cola →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Lista de posts en cola */}
            <h3 className="font-semibold text-gray-700">Posts en cola ({posts.filter(p => p.status === "draft" || p.status === "approved").length})</h3>
            {posts.filter(p => p.status === "draft" || p.status === "approved").map(p => (
              <PostCard key={p.id} post={p} images={images}
                onApprove={() => approvePost(p.id)}
                onPublish={() => publishPost(p.id)}
                onDelete={() => deletePost(p.id)}
                publishing={publishing === p.id}
              />
            ))}
            {posts.filter(p => p.status === "draft" || p.status === "approved").length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-2xl mb-2">📭</p>
                <p className="text-sm">No hay posts en cola. Genera uno arriba.</p>
              </div>
            )}
          </div>
        )}

        {/* ── PUBLICADOS ── */}
        {tab === "published" && (
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700">Historial de publicaciones ({posts.length})</h3>
              <button onClick={async () => {
                setMsg(null);
                try {
                  const r = await fetch("/api/autopilot/analytics", { method: "POST" }).then(res => res.json()) as { ok: boolean; updated: number };
                  showMsg(true, `Estadísticas actualizadas (${r.updated} posts)`);
                  loadPosts("published");
                } catch { showMsg(false, "Error actualizando estadísticas"); }
              }} className="text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                🔄 Actualizar stats
              </button>
            </div>
            {posts.map(p => (
              <PostCard key={p.id} post={p} images={images} onDelete={() => deletePost(p.id)} publishing={false} />
            ))}
            {posts.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-2xl mb-2">📊</p>
                <p className="text-sm">Aún no hay publicaciones.</p>
              </div>
            )}
            {posts.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="text-orange-800 font-medium text-sm">🚀 Fase 3 — Impulsar con Meta Ads</p>
                <p className="text-orange-700 text-xs mt-1">Para impulsar un post con presupuesto publicitario, usa el botón <strong>Impulsar</strong> en cada publicación. Te llevará directamente a Meta Ads Manager — tu empresa maneja el presupuesto directamente con Meta, Hivo no toca dinero.</p>
              </div>
            )}
          </div>
        )}

        {/* ── CONFIGURACIÓN ── */}
        {tab === "config" && (
          <div className="space-y-6 max-w-lg">
            <div>
              <h3 className="font-semibold text-gray-800 mb-4">Configuración del Autopilot</h3>

              {/* Tono */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 block mb-2">Tono de comunicación</label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map(t => (
                    <button key={t.value} type="button" onClick={() => setConfig({...config, tone: t.value})}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${config.tone === t.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frecuencia */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 block mb-2">Frecuencia de publicación</label>
                <div className="grid grid-cols-2 gap-2">
                  {FREQUENCIES.map(f => (
                    <button key={f.value} type="button" onClick={() => setConfig({...config, frequency: f.value})}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${config.frequency === f.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hora de publicación */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 block mb-1">Hora de publicación</label>
                <select value={config.posting_hour} onChange={e => setConfig({...config, posting_hour: Number(e.target.value)})}
                  className="w-full border rounded-xl px-3 py-2 text-sm">
                  {[7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(h => (
                    <option key={h} value={h}>{h}:00 {h < 12 ? "AM" : "PM"}</option>
                  ))}
                </select>
              </div>

              {/* Plataformas */}
              <div className="mb-4 space-y-2">
                <label className="text-sm font-medium text-gray-700 block">Publicar en</label>
                {[
                  { key: "publish_facebook" as const, label: "📘 Facebook Page" },
                  { key: "publish_instagram" as const, label: "📸 Instagram Business" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={() => setConfig({...config, [key]: config[key] === 1 ? 0 : 1})}
                      className={`relative w-10 h-5 rounded-full transition-colors ${config[key] === 1 ? "bg-blue-500" : "bg-gray-300"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config[key] === 1 ? "translate-x-5" : ""}`} />
                    </button>
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>

              <div className="mb-4 space-y-2">
                <label className="text-sm font-medium text-gray-700 block">Modo de publicación</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <button type="button" onClick={() => setConfig({...config, auto_approve: config.auto_approve === 1 ? 0 : 1})}
                    className={`relative w-10 h-5 rounded-full transition-colors ${config.auto_approve === 1 ? "bg-blue-500" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.auto_approve === 1 ? "translate-x-5" : ""}`} />
                  </button>
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Publicación automática</span>
                    <p className="text-xs text-gray-400">El sistema genera y publica solo, según la frecuencia configurada</p>
                  </div>
                </label>
                {config.auto_approve === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    📋 Modo manual activo: el sistema genera el contenido y tú apruebas antes de publicar.
                  </p>
                )}
              </div>

              <button onClick={saveConfig} disabled={saving}
                className="w-full text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: "#0077b6" }}>
                {saving ? "Guardando..." : "Guardar configuración"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Post Card Component ───────────────────────────────────────────────────────
function PostCard({ post, images, onApprove, onPublish, onDelete, publishing }: {
  post: AutoPost; images: AutoImage[];
  onApprove?: () => void; onPublish?: () => void; onDelete: () => void; publishing: boolean;
}) {
  const image = images.find(i => i.filename === post.image_filename);
  return (
    <div className="bg-white border rounded-2xl p-4 flex gap-4">
      {post.image_filename && (
        <img src={`/api/uploads/autopilot/${post.image_filename}`}
          className="w-20 h-20 object-cover rounded-xl shrink-0" />
      )}
      {!post.image_filename && (
        <div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center text-gray-300 text-2xl">📷</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[post.status]}`}>
            {STATUS_LABEL[post.status]}
          </span>
          <div className="flex gap-1">
            {post.platform === "both" || post.platform === "facebook" ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">FB</span> : null}
            {post.platform === "both" || post.platform === "instagram" ? <span className="text-xs bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded">IG</span> : null}
          </div>
        </div>
        <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
        {post.hashtags && <p className="text-xs text-blue-500 mt-0.5 truncate">{post.hashtags}</p>}
        {post.error_msg && <p className="text-xs text-red-500 mt-0.5">{post.error_msg}</p>}
        {post.published_at && <p className="text-xs text-gray-400 mt-1">{new Date(post.published_at * 1000).toLocaleString("es-CO")}</p>}

        <div className="flex gap-2 mt-2 flex-wrap">
          {post.status === "draft" && onApprove && (
            <button onClick={onApprove} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100">
              ✓ Aprobar
            </button>
          )}
          {(post.status === "draft" || post.status === "approved") && onPublish && (
            <button onClick={onPublish} disabled={publishing}
              className="text-xs text-white px-2 py-1 rounded-lg disabled:opacity-50"
              style={{ background: "#0077b6" }}>
              {publishing ? "Publicando..." : "🚀 Publicar ahora"}
            </button>
          )}
            {post.fb_post_id && (
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg">✓ FB</span>
          )}
          {post.ig_post_id && (
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg">✓ IG</span>
          )}
          {/* Likes */}
          {post.status === "published" && (post.fb_likes > 0 || post.ig_likes > 0) && (
            <span className="text-xs text-gray-500 px-1">
              {post.fb_likes > 0 && `👍 ${post.fb_likes} FB`}
              {post.fb_likes > 0 && post.ig_likes > 0 && " · "}
              {post.ig_likes > 0 && `❤️ ${post.ig_likes} IG`}
            </span>
          )}
          {/* Boost button — only for published posts with fb_post_id */}
          {post.status === "published" && post.fb_post_id && (
            <button onClick={() => {
              const adsUrl = `https://www.facebook.com/ads/create?objective=POST_ENGAGEMENT&source_post_id=${post.fb_post_id}`;
              window.open(adsUrl, "_blank", "noopener,noreferrer");
            }}
              className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded-lg hover:bg-orange-100 font-medium">
              🚀 Impulsar
            </button>
          )}
          <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 ml-auto">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
