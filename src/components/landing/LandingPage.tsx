"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Plan {
  id: number; name: string; description: string | null;
  price_monthly: number; price_usd: number; billing_cycle: string;
  modules: string; max_users: number; max_wa_numbers: number;
}

const PROBLEMS = [
  { icon: "😤", title: "Clientes que no reciben respuesta", desc: "Escriben a WhatsApp fuera de horario y se van con la competencia porque nadie responde." },
  { icon: "📋", title: "Leads que se pierden entre chats", desc: "Sin seguimiento organizado, los prospectos se enfrían y las ventas se escapan." },
  { icon: "📅", title: "Reservas desorganizadas", desc: "Agendas en papel, mensajes perdidos y clientes que llegan sin reserva confirmada." },
  { icon: "💸", title: "Sin claridad financiera", desc: "No sabes cuánto ingresaste este mes, cuánto debes cobrar o qué está pendiente." },
  { icon: "📱", title: "Redes sociales descuidadas", desc: "No tienes tiempo para publicar contenido consistente que atraiga nuevos clientes." },
  { icon: "🔄", title: "Procesos manuales que consumen tiempo", desc: "Copiar datos, enviar confirmaciones, recordar pagos — todo a mano, todo lento." },
];

const FEATURES = [
  { icon: "🤖", title: "Julieta — IA 24/7", desc: "Responde WhatsApp automáticamente, cotiza servicios, recibe pagos y confirma reservas. Sin descanso, sin errores." },
  { icon: "👥", title: "CRM integrado", desc: "Pipeline visual de ventas. Ve exactamente en qué etapa está cada cliente y qué acción tomar." },
  { icon: "📅", title: "Calendario de reservas", desc: "Reservas automáticas con comprobante PDF, recordatorios por WhatsApp y control de pagos." },
  { icon: "💰", title: "Contabilidad automática", desc: "Cada pago aprobado se registra solo. Ve tus ingresos, egresos y margen en tiempo real." },
  { icon: "🚀", title: "Autopilot — Redes sociales", desc: "Genera y publica contenido en Facebook e Instagram automáticamente con IA." },
  { icon: "🎤", title: "Entiende audios de WhatsApp", desc: "Julieta transcribe los mensajes de voz, confirma lo que entendió y los procesa automáticamente." },
  { icon: "📊", title: "Analytics en tiempo real", desc: "Métricas de conversión, horas pico, productos más vendidos y tasa de respuesta del bot." },
  { icon: "🔧", title: "Admin por WhatsApp", desc: "Consulta datos de tu negocio desde tu WhatsApp personal con una palabra clave secreta." },
];

const STEPS = [
  { n: "01", title: "Regístrate en minutos", desc: "Crea tu cuenta, elige tu plan y conecta tu número de WhatsApp. Sin instalaciones." },
  { n: "02", title: "Configura tu IA", desc: "Dale a Julieta las instrucciones de tu negocio: precios, servicios y cómo debe atender." },
  { n: "03", title: "Sube tu catálogo", desc: "Agrega tus productos o servicios con fotos y precios. Julieta los cotizará automáticamente." },
  { n: "04", title: "Activa y vende", desc: "Julieta empieza a atender clientes 24/7. Tú solo supervisas y apruebas pagos." },
];

const SEO_TAGS = ["automatización whatsapp colombia", "chatbot whatsapp pymes", "crm whatsapp automatico", "reservas por whatsapp", "ia para negocios colombia"];

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<"cop"|"usd">("cop");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Si ya tiene sesión → ir al dashboard
    fetch("/api/auth/me").then(r => {
      if (r.ok) window.location.href = "/dashboard";
    }).catch(() => {});
    fetch("/api/public/plans").then(r => r.json()).then(d => setPlans(d.plans ?? [])).catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const moduleList: Record<string, string> = {
    chat: "Chat WhatsApp", crm: "CRM Pipeline", calendar: "Calendario reservas",
    accounting: "Contabilidad", products: "Catálogo productos", campaigns: "Email marketing",
    documents: "Documentos legales", analytics: "Analytics", suppliers: "Proveedores",
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* SEO hidden keywords */}
      <div className="sr-only">{SEO_TAGS.join(", ")}</div>

      {/* ── NAVBAR ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/95 backdrop-blur shadow-sm" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white text-sm" style={{ background: "linear-gradient(135deg,#1e1b4b,#0077b6)" }}>A</div>
            <span className="font-bold text-xl text-gray-900">Aivox</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#problemas" className="hover:text-gray-900 transition-colors">Problemas</a>
            <a href="#funciones" className="hover:text-gray-900 transition-colors">Funciones</a>
            <a href="#como-funciona" className="hover:text-gray-900 transition-colors">¿Cómo funciona?</a>
            <a href="#planes" className="hover:text-gray-900 transition-colors">Planes</a>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Iniciar sesión
            </Link>
            <Link href="/register" className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all hover:opacity-90 shadow-md"
              style={{ background: "linear-gradient(135deg,#1e1b4b,#0077b6)" }}>
              Comenzar gratis →
            </Link>
          </div>
          <button className="md:hidden text-gray-600" onClick={() => setMenuOpen(!menuOpen)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-white border-t px-6 py-4 space-y-3">
            {["problemas","funciones","como-funciona","planes"].map(id => (
              <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}
                className="block text-sm font-medium text-gray-600 py-1 capitalize">{id.replace("-"," ")}</a>
            ))}
            <Link href="/login" className="block text-sm font-medium text-gray-600 py-1">Iniciar sesión</Link>
            <Link href="/register" className="block text-sm font-semibold text-white text-center py-2.5 rounded-xl"
              style={{ background: "linear-gradient(135deg,#1e1b4b,#0077b6)" }}>Comenzar gratis →</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: "linear-gradient(135deg,#0a0818 0%,#1e1b4b 50%,#0c2a4a 100%)" }}>
        <div className="absolute inset-0 overflow-hidden">
          {[
            {w:180,h:180,l:10,t:20,d:0},{w:80,h:80,l:85,t:10,d:1},{w:220,h:220,l:70,t:60,d:0.5},
            {w:100,h:100,l:20,t:75,d:1.5},{w:150,h:150,l:50,t:40,d:0.3},{w:60,h:60,l:5,t:50,d:2},
            {w:200,h:200,l:40,t:80,d:0.8},{w:90,h:90,l:90,t:40,d:1.2},{w:120,h:120,l:30,t:5,d:0.2},
          ].map((c, i) => (
            <div key={i} className="absolute rounded-full opacity-10 animate-pulse"
              style={{ width: c.w, height: c.h, left: `${c.l}%`, top: `${c.t}%`, background: "#0077b6", animationDelay: `${c.d}s` }} />
          ))}
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-2 mb-8 text-sm text-white/80">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Más de 100 negocios ya automatizados en LATAM
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white mb-6 leading-tight">
            Tu negocio vendiendo<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg,#38bdf8,#818cf8)" }}>
              24/7 por WhatsApp
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-white/70 mb-10 max-w-3xl mx-auto leading-relaxed">
            Aivox convierte tu WhatsApp en un vendedor automático con IA. Responde clientes, gestiona reservas, registra pagos y publica en redes — sin que tú hagas nada.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/register"
              className="text-lg font-bold text-white px-8 py-4 rounded-2xl shadow-2xl transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg,#0077b6,#005f8c)" }}>
              Empezar gratis ahora →
            </Link>
            <a href="#como-funciona"
              className="text-lg font-semibold text-white/80 px-8 py-4 rounded-2xl border border-white/20 hover:bg-white/10 transition-all">
              Ver cómo funciona
            </a>
          </div>
          <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto text-center">
            {[["24/7","Atención automática"],["5 min","Para configurar"],["$0","Costo inicial"]].map(([n,l]) => (
              <div key={n}>
                <p className="text-3xl font-black text-white">{n}</p>
                <p className="text-xs text-white/50 mt-1">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── PROBLEMAS ── */}
      <section id="problemas" className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-red-500 uppercase tracking-wider">¿Te suena familiar?</span>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 mt-3 mb-4">Problemas que Aivox<br />resuelve hoy</h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">Cada uno de estos problemas le está costando dinero a tu negocio todos los días.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PROBLEMS.map((p, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-red-200 hover:shadow-lg transition-all group">
                <span className="text-4xl mb-4 block">{p.icon}</span>
                <h3 className="font-bold text-gray-900 text-lg mb-2 group-hover:text-red-600 transition-colors">{p.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <p className="text-2xl font-bold text-gray-900">¿Reconoces alguno? <span className="text-blue-600">Aivox los elimina todos.</span></p>
          </div>
        </div>
      </section>

      {/* ── FUNCIONES ── */}
      <section id="funciones" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Todo en uno</span>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 mt-3 mb-4">Una plataforma.<br />Todos los procesos.</h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto">Desde el primer mensaje hasta el pago confirmado — automatizado.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="group p-6 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section id="como-funciona" className="py-24" style={{ background: "linear-gradient(135deg,#0a0818,#1e1b4b)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Simple y rápido</span>
            <h2 className="text-3xl md:text-5xl font-black text-white mt-3 mb-4">Empieza en 4 pasos</h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">Sin código, sin técnicos, sin complicaciones.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {STEPS.map((s, i) => (
              <div key={i} className="text-center relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-1/2 w-full h-0.5 bg-white/10" />
                )}
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 relative z-10 font-black text-2xl text-white" style={{ background: "linear-gradient(135deg,#0077b6,#005f8c)" }}>
                  {s.n}
                </div>
                <h3 className="font-bold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-16">
            <Link href="/register" className="inline-block text-lg font-bold text-white px-10 py-5 rounded-2xl shadow-2xl hover:scale-105 transition-all"
              style={{ background: "linear-gradient(135deg,#0077b6,#005f8c)" }}>
              Quiero automatizar mi negocio →
            </Link>
          </div>
        </div>
      </section>

      {/* ── PLANES ── */}
      <section id="planes" className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Precios transparentes</span>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 mt-3 mb-4">Planes para cada negocio</h2>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-8">Sin permanencia, sin letra pequeña. Cancela cuando quieras.</p>
            <div className="inline-flex bg-gray-200 rounded-xl p-1">
              <button onClick={() => setBilling("cop")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing==="cop"?"bg-white text-gray-900 shadow":"text-gray-500"}`}>COP</button>
              <button onClick={() => setBilling("usd")} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing==="usd"?"bg-white text-gray-900 shadow":"text-gray-500"}`}>USD</button>
            </div>
          </div>

          {plans.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Cargando planes...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {plans.filter(p => p.billing_cycle !== "permanent").map((plan, i) => {
                const mods = JSON.parse(plan.modules || "{}");
                const isPopular = i === 1;
                const price = billing === "cop" ? plan.price_monthly : (plan.price_usd || Math.round(plan.price_monthly / 4200));
                return (
                  <div key={plan.id} className={`relative bg-white rounded-3xl p-8 border-2 transition-all hover:shadow-xl ${isPopular ? "border-blue-500 shadow-blue-100 shadow-lg scale-105" : "border-gray-200"}`}>
                    {isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <span className="bg-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded-full">MÁS POPULAR</span>
                      </div>
                    )}
                    <h3 className="text-xl font-black text-gray-900 mb-1">{plan.name}</h3>
                    <p className="text-gray-400 text-sm mb-6">{plan.description ?? "Perfecto para tu negocio"}</p>
                    <div className="mb-6">
                      <span className="text-4xl font-black text-gray-900">
                        {billing === "cop" ? `$${price.toLocaleString("es-CO")}` : `$${price}`}
                      </span>
                      <span className="text-gray-400 text-sm ml-1">/{billing === "cop" ? "mes" : "mo"}</span>
                    </div>
                    <div className="space-y-2 mb-8">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Incluye</p>
                      {Object.entries(mods).filter(([,v]) => v).map(([k]) => (
                        <div key={k} className="flex items-center gap-2 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          {moduleList[k] ?? k}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Hasta {plan.max_users} usuario{plan.max_users !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <Link href="/register"
                      className={`block text-center font-bold py-3.5 rounded-xl transition-all hover:opacity-90 ${isPopular ? "text-white" : "text-blue-600 border-2 border-blue-200 hover:border-blue-400"}`}
                      style={isPopular ? { background: "linear-gradient(135deg,#1e1b4b,#0077b6)" } : {}}>
                      Empezar con {plan.name}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-center mt-12">
            <p className="text-gray-500 text-sm">¿Necesitas algo personalizado? <a href="mailto:hola@aivoxgroup.com" className="text-blue-600 font-medium hover:underline">Escríbenos →</a></p>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-6">
            Tu negocio merece trabajar<br />mientras tú descansas
          </h2>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Únete a los negocios que ya automatizaron sus ventas con Aivox. Configura en 5 minutos y empieza a ver resultados hoy.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="text-xl font-bold text-white px-10 py-5 rounded-2xl shadow-2xl hover:scale-105 transition-all"
              style={{ background: "linear-gradient(135deg,#1e1b4b,#0077b6)" }}>
              Crear mi cuenta gratis →
            </Link>
            <Link href="/login" className="text-xl font-semibold text-gray-600 px-10 py-5 rounded-2xl border-2 border-gray-200 hover:border-gray-400 transition-all">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white text-sm" style={{ background: "linear-gradient(135deg,#1e1b4b,#0077b6)" }}>A</div>
                <span className="font-bold text-xl">Aivox</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                Plataforma SaaS de automatización WhatsApp con inteligencia artificial para PYMES latinoamericanas.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">Plataforma</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#funciones" className="hover:text-white transition-colors">Funciones</a></li>
                <li><a href="#planes" className="hover:text-white transition-colors">Planes</a></li>
                <li><Link href="/register" className="hover:text-white transition-colors">Registrarse</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Iniciar sesión</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">Contacto</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="mailto:hola@aivoxgroup.com" className="hover:text-white transition-colors">hola@aivoxgroup.com</a></li>
                <li><span>Colombia · LATAM</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">© 2026 Aivox Group. Todos los derechos reservados.</p>
            <p className="text-gray-600 text-xs">Automatización WhatsApp · CRM · Reservas · IA · Colombia · LATAM</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
