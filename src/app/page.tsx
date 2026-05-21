import { listPlans } from "@/lib/master/db-master";
import PricingSection from "@/components/landing/PricingSection";

function getPlans() {
  try { return listPlans().filter((p) => p.active && p.billing_cycle !== "permanent"); }
  catch { return []; }
}

export default function Home() {
  const plans = getPlans();

  const FEATURES = [
    { icon: "🤖", t: "IA 24/7 por WhatsApp", d: "Julieta responde, cotiza y confirma reservas automáticamente. Sin pausas, sin errores." },
    { icon: "👥", t: "CRM integrado", d: "Pipeline visual de ventas. Sigue cada lead desde el primer contacto hasta el cierre." },
    { icon: "📅", t: "Calendario de reservas", d: "Reservas automáticas con PDF, recordatorios y control de pagos en un solo lugar." },
    { icon: "💰", t: "Contabilidad automática", d: "Cada pago aprobado se registra solo. Ingresos, egresos y margen en tiempo real." },
    { icon: "🚀", t: "Autopilot — Redes sociales", d: "Genera y publica contenido en Facebook e Instagram automáticamente con IA." },
    { icon: "🎤", t: "Entiende audios de WhatsApp", d: "Transcribe mensajes de voz, confirma con el cliente y los procesa automáticamente." },
    { icon: "📊", t: "Analytics en tiempo real", d: "Conversiones, horas pico, productos más vendidos y tasa de respuesta del bot." },
    { icon: "🔧", t: "Admin por WhatsApp", d: "Consulta datos de tu negocio desde tu WhatsApp personal con una clave secreta." },
    { icon: "📧", t: "Email marketing", d: "Campañas segmentadas por etapa del CRM. Llega a tus clientes en el momento exacto." },
    { icon: "📄", t: "Documentos legales", d: "Política de datos, términos de servicio. Enviados automáticamente al inicio de cada chat." },
    { icon: "🤝", t: "Gestión de proveedores", d: "Registra aliados, costos y documentos. Asocia proveedores a cada servicio." },
    { icon: "🛍️", t: "Catálogo de productos", d: "Sube fotos, precios e instrucciones. Julieta cotiza con los datos reales." },
  ];

  const EXTENSIONS = [
    { icon: "🚀", t: "Autopilot Social Media", d: "Publica en Facebook e Instagram automáticamente. Genera contenido con IA a partir de tus productos." },
    { icon: "🎤", t: "Audio IA — Transcripción", d: "Convierte mensajes de voz en texto con IA. Julieta entiende y responde audios de WhatsApp." },
    { icon: "🔧", t: "Modo Admin WhatsApp", d: "Consulta reservas, ingresos y datos de tu negocio con una clave secreta desde tu WhatsApp." },
  ];

  const STEPS = [
    { n: "01", t: "Regístrate en minutos", d: "Crea tu cuenta, elige tu plan y conecta WhatsApp. Sin instalaciones." },
    { n: "02", t: "Configura tu IA", d: "Dale instrucciones a Julieta: precios, servicios y cómo atender a tus clientes." },
    { n: "03", t: "Sube tu catálogo", d: "Agrega productos con fotos y precios. Julieta cotiza automáticamente." },
    { n: "04", t: "Activa y vende 24/7", d: "Julieta atiende clientes todo el día. Tú solo supervisas y apruebas pagos." },
  ];

  const PROBLEMS = [
    { e: "😤", t: "Clientes sin respuesta", d: "Escriben a WhatsApp fuera de horario y se van con la competencia." },
    { e: "📋", t: "Leads que se pierden", d: "Sin seguimiento organizado, los prospectos se enfrían y las ventas se escapan." },
    { e: "📅", t: "Reservas desorganizadas", d: "Agendas en papel, mensajes perdidos y clientes que llegan sin confirmación." },
    { e: "💸", t: "Sin claridad financiera", d: "No sabes cuánto ingresaste este mes ni qué está pendiente de cobro." },
    { e: "📱", t: "Redes sociales descuidadas", d: "No tienes tiempo para publicar contenido que atraiga nuevos clientes." },
    { e: "🔄", t: "Todo manual y lento", d: "Copiar datos, enviar confirmaciones, recordar pagos — todo a mano." },
  ];

  const moduleList: Record<string, string> = {
    chat: "Chat WhatsApp", crm: "CRM Pipeline", calendar: "Calendario de reservas",
    accounting: "Contabilidad", products: "Catálogo de productos", campaigns: "Email marketing",
    documents: "Documentos legales", analytics: "Analytics", suppliers: "Gestión proveedores",
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,-apple-system,sans-serif;color:#111;overflow-x:hidden}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
        a{text-decoration:none}
        /* NAV */
        .nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between;background:rgba(10,8,24,0.85);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06)}
        .nav-brand{display:flex;align-items:center;gap:10px;color:white;font-weight:800;font-size:1.2rem}
        .nav-box{width:32px;height:32px;background:linear-gradient(135deg,#1e1b4b,#0077b6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;color:white;font-size:14px}
        .nav-links{display:flex;align-items:center;gap:0.5rem}
        .nav-links a{color:rgba(255,255,255,0.7);padding:0.4rem 1rem;border-radius:8px;font-size:0.9rem;font-weight:500;transition:color .2s}
        .nav-links a:hover{color:white;background:rgba(255,255,255,0.08)}
        .btn-nav{background:linear-gradient(135deg,#0077b6,#005f8c) !important;color:white !important;font-weight:700 !important;padding:0.5rem 1.2rem !important;border-radius:10px !important}
        /* HERO */
        .hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:8rem 2rem 4rem;background:linear-gradient(135deg,#0a0818 0%,#1e1b4b 50%,#0c2a4a 100%);position:relative;overflow:hidden}
        .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(0,119,182,0.15),transparent 60%),radial-gradient(ellipse at 80% 50%,rgba(99,102,241,0.1),transparent 60%)}
        .hero-inner{position:relative;max-width:900px;margin:0 auto}
        .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:100px;padding:6px 18px;font-size:.85rem;color:rgba(255,255,255,0.75);margin-bottom:2rem}
        .dot{width:7px;height:7px;background:#10b981;border-radius:50%;display:inline-block;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        h1{font-size:clamp(2.2rem,6vw,4.5rem);font-weight:900;color:white;line-height:1.1;margin-bottom:1.5rem}
        .grad{background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero p{font-size:clamp(1rem,2.5vw,1.3rem);color:rgba(255,255,255,0.65);max-width:650px;margin:0 auto 2.5rem;line-height:1.7}
        .btns{display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin-bottom:3.5rem}
        .btn-main{background:linear-gradient(135deg,#0077b6,#005f8c);color:white;padding:1rem 2.5rem;border-radius:14px;font-weight:700;font-size:1.05rem;transition:transform .2s,opacity .2s}
        .btn-main:hover{opacity:.9;transform:translateY(-1px)}
        .btn-sec{border:2px solid rgba(255,255,255,0.25);color:rgba(255,255,255,0.8);padding:1rem 2.5rem;border-radius:14px;font-weight:600;font-size:1.05rem;transition:border-color .2s,color .2s}
        .btn-sec:hover{border-color:rgba(255,255,255,0.5);color:white}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:2rem;max-width:380px;margin:0 auto}
        .stat-n{font-size:2rem;font-weight:900;color:white}
        .stat-l{font-size:.75rem;color:rgba(255,255,255,0.45);margin-top:2px}
        /* SECTIONS */
        .section{padding:5rem 2rem}
        .container{max-width:1100px;margin:0 auto}
        .section-label{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.8rem}
        .section-title{font-size:clamp(1.8rem,4vw,3rem);font-weight:900;line-height:1.15;margin-bottom:1rem}
        .section-sub{font-size:1.1rem;color:#6b7280;max-width:580px;margin:0 auto;line-height:1.6}
        .text-center{text-align:center}
        /* PROBLEMS */
        .problems{background:#f9fafb}
        .grid-3{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem;margin-top:3rem}
        .card{background:white;border-radius:16px;padding:1.5rem;border:1px solid #e5e7eb;transition:border-color .2s,box-shadow .2s}
        .card:hover{border-color:#bfdbfe;box-shadow:0 4px 20px rgba(0,119,182,.08)}
        .card-icon{font-size:2.2rem;margin-bottom:1rem}
        .card-title{font-weight:700;color:#111;font-size:1.05rem;margin-bottom:.4rem}
        .card-desc{color:#6b7280;font-size:.9rem;line-height:1.6}
        /* FEATURES */
        .features{background:white}
        .grid-4{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1.25rem;margin-top:3rem}
        .feat-card{padding:1.5rem;border-radius:16px;border:1px solid #f3f4f6;transition:all .2s}
        .feat-card:hover{border-color:#bfdbfe;background:#f0f9ff}
        .feat-icon{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#ede9fe,#dbeafe);display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:1rem}
        /* HOW IT WORKS */
        .how{background:linear-gradient(135deg,#0a0818,#1e1b4b);color:white}
        .how .section-label{color:#60a5fa}
        .how .section-title{color:white}
        .how .section-sub{color:rgba(255,255,255,0.55)}
        .steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2rem;margin-top:3rem}
        .step-n{width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#0077b6,#005f8c);display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:900;color:white;margin:0 auto 1rem}
        .step-title{color:white;font-weight:700;margin-bottom:.5rem;text-align:center}
        .step-desc{color:rgba(255,255,255,0.5);font-size:.9rem;line-height:1.6;text-align:center}
        /* EXTENSIONS */
        .extensions{background:#f9fafb}
        .ext-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem;margin-top:3rem}
        .ext-card{background:white;border-radius:16px;padding:1.75rem;border:2px solid #e5e7eb;position:relative;overflow:hidden}
        .ext-card::before{content:'Extensión';position:absolute;top:1rem;right:1rem;background:#fef3c7;color:#92400e;font-size:.7rem;font-weight:700;padding:2px 10px;border-radius:100px;text-transform:uppercase}
        .ext-icon{font-size:2.5rem;margin-bottom:1rem}
        .ext-title{font-weight:800;font-size:1.1rem;margin-bottom:.5rem}
        .ext-desc{color:#6b7280;font-size:.9rem;line-height:1.6}
        /* CTA */
        .cta{background:white;text-align:center}
        /* FOOTER */
        .footer{background:#0a0818;color:white;padding:4rem 2rem 2rem}
        .footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:3rem;max-width:1100px;margin:0 auto 3rem}
        .footer-brand{font-weight:700;font-size:1.2rem;display:flex;align-items:center;gap:10px;margin-bottom:1rem}
        .footer-desc{color:rgba(255,255,255,0.45);font-size:.9rem;line-height:1.7;max-width:320px}
        .footer-col h4{color:rgba(255,255,255,0.45);font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:1rem}
        .footer-col a{display:block;color:rgba(255,255,255,0.6);font-size:.9rem;margin-bottom:.6rem;transition:color .2s}
        .footer-col a:hover{color:white}
        .footer-bottom{max-width:1100px;margin:0 auto;padding-top:2rem;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem}
        .footer-bottom p{color:rgba(255,255,255,0.3);font-size:.8rem}
        @media(max-width:768px){
          .nav-links .hide-mobile{display:none}
          .footer-grid{grid-template-columns:1fr}
          .footer-bottom{flex-direction:column;text-align:center}
        }
      `}} />

      {/* SEO Keywords */}
      <span className="sr-only">automatización whatsapp colombia chatbot whatsapp pymes crm whatsapp automatico reservas whatsapp ia negocios colombia aivox</span>

      {/* ── NAVBAR ── */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-box">A</div>
          Aivox
        </div>
        <div className="nav-links">
          <a href="#funciones" className="hide-mobile">Funciones</a>
          <a href="#planes" className="hide-mobile">Planes</a>
          <a href="/login">Iniciar sesión</a>
          <a href="/register" className="btn-nav">Empezar gratis →</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="badge"><span className="dot" />+100 negocios automatizados en LATAM</div>
          <h1>Tu negocio vendiendo<br /><span className="grad">24/7 por WhatsApp</span></h1>
          <p>Aivox convierte tu WhatsApp en un vendedor automático con IA. Responde clientes, gestiona reservas, registra pagos y publica en redes — sin que tú hagas nada.</p>
          <div className="btns">
            <a href="/register" className="btn-main">Empezar gratis ahora →</a>
            <a href="#como-funciona" className="btn-sec">Ver cómo funciona</a>
          </div>
          <div className="stats">
            <div><div className="stat-n">24/7</div><div className="stat-l">Atención automática</div></div>
            <div><div className="stat-n">5 min</div><div className="stat-l">Para configurar</div></div>
            <div><div className="stat-n">$0</div><div className="stat-l">Costo inicial</div></div>
          </div>
        </div>
      </section>

      {/* ── PROBLEMAS ── */}
      <section className="section problems" id="problemas">
        <div className="container">
          <div className="text-center">
            <div className="section-label" style={{color:"#ef4444"}}>¿Te suena familiar?</div>
            <div className="section-title">Problemas que Aivox resuelve hoy</div>
            <div className="section-sub">Cada uno de estos problemas le está costando dinero a tu negocio todos los días.</div>
          </div>
          <div className="grid-3">
            {PROBLEMS.map((p, i) => (
              <div key={i} className="card">
                <div className="card-icon">{p.e}</div>
                <div className="card-title">{p.t}</div>
                <div className="card-desc">{p.d}</div>
              </div>
            ))}
          </div>
          <div className="text-center" style={{marginTop:"3rem"}}>
            <p style={{fontSize:"1.3rem",fontWeight:700}}>¿Reconoces alguno? <span style={{color:"#0077b6"}}>Aivox los elimina todos.</span></p>
          </div>
        </div>
      </section>

      {/* ── FUNCIONES ── */}
      <section className="section features" id="funciones">
        <div className="container">
          <div className="text-center">
            <div className="section-label" style={{color:"#0077b6"}}>Todo en uno</div>
            <div className="section-title">Una plataforma. Todos los procesos.</div>
            <div className="section-sub">Desde el primer mensaje hasta el pago confirmado — completamente automatizado.</div>
          </div>
          <div className="grid-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="feat-card">
                <div className="feat-icon">{f.icon}</div>
                <div style={{fontWeight:700,marginBottom:".4rem"}}>{f.t}</div>
                <div style={{color:"#6b7280",fontSize:".9rem",lineHeight:1.6}}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section className="section how" id="como-funciona">
        <div className="container">
          <div className="text-center">
            <div className="section-label">Simple y rápido</div>
            <div className="section-title">Empieza en 4 pasos</div>
            <div className="section-sub">Sin código, sin técnicos, sin complicaciones.</div>
          </div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div key={i}>
                <div className="step-n">{s.n}</div>
                <div className="step-title">{s.t}</div>
                <div className="step-desc">{s.d}</div>
              </div>
            ))}
          </div>
          <div className="text-center" style={{marginTop:"3rem"}}>
            <a href="/register" className="btn-main" style={{display:"inline-block",fontSize:"1.1rem",padding:"1.1rem 3rem"}}>
              Quiero automatizar mi negocio →
            </a>
          </div>
        </div>
      </section>

      {/* ── EXTENSIONES ── */}
      <section className="section extensions" id="extensiones">
        <div className="container">
          <div className="text-center">
            <div className="section-label" style={{color:"#d97706"}}>Funcionalidades adicionales</div>
            <div className="section-title">Extensiones para potenciar tu plan</div>
            <div className="section-sub">Actívalas cuando las necesites. Cada extensión amplía las capacidades de Julieta sin cambiar tu plan base.</div>
          </div>
          <div className="ext-grid">
            {EXTENSIONS.map((e, i) => (
              <div key={i} className="ext-card">
                <div className="ext-icon">{e.icon}</div>
                <div className="ext-title">{e.t}</div>
                <div className="ext-desc">{e.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANES (dinámicos desde el sistema) ── */}
      <section className="section" id="planes" style={{background:"white"}}>
        <div className="container">
          <div className="text-center">
            <div className="section-label" style={{color:"#0077b6"}}>Precios transparentes</div>
            <div className="section-title">Planes para cada negocio</div>
            <div className="section-sub">Sin permanencia. Cancela cuando quieras.</div>
          </div>
          <PricingSection plans={plans} moduleList={moduleList} />
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="section cta" style={{background:"#f9fafb"}}>
        <div className="container text-center" style={{maxWidth:"700px"}}>
          <div className="section-title">Tu negocio merece trabajar<br />mientras tú descansas</div>
          <p style={{color:"#6b7280",fontSize:"1.1rem",margin:"1.5rem 0 2.5rem",lineHeight:1.7}}>
            Configura en 5 minutos y empieza a ver resultados hoy. Sin tarjeta de crédito, sin permanencia.
          </p>
          <div className="btns" style={{justifyContent:"center"}}>
            <a href="/register" className="btn-main" style={{fontSize:"1.1rem",padding:"1.1rem 3rem"}}>Crear mi cuenta gratis →</a>
            <a href="/login" className="btn-sec" style={{fontSize:"1.1rem",padding:"1.1rem 3rem"}}>Ya tengo cuenta</a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <div className="nav-box">A</div>
              Aivox
            </div>
            <div className="footer-desc">Plataforma SaaS de automatización WhatsApp con IA para PYMES latinoamericanas.</div>
          </div>
          <div className="footer-col">
            <h4>Plataforma</h4>
            <a href="#funciones">Funciones</a>
            <a href="#extensiones">Extensiones</a>
            <a href="#planes">Planes</a>
            <a href="/register">Registrarse</a>
            <a href="/login">Iniciar sesión</a>
          </div>
          <div className="footer-col">
            <h4>Contacto</h4>
            <a href="mailto:hola@aivoxgroup.com">hola@aivoxgroup.com</a>
            <a href="https://wa.me/573008165767">WhatsApp</a>
            <span style={{color:"rgba(255,255,255,0.3)",fontSize:".85rem"}}>Colombia · LATAM</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Aivox Group. Todos los derechos reservados.</p>
          <p>Automatización WhatsApp · CRM · Reservas · IA · Colombia · LATAM</p>
        </div>
      </footer>
    </>
  );
}
