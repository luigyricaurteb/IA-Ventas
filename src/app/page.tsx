export const dynamic = "force-dynamic";

import { listPlans } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import PricingSection from "@/components/landing/PricingSection";

function getData() {
  try {
    const plans = listPlans().filter((p) => p.active && p.billing_cycle !== "permanent");
    const db = getCompanyDb("platform");
    const cfg = db.prepare("SELECT name, email, phone FROM company_config WHERE id=1").get() as {
      name: string | null; email: string | null; phone: string | null;
    } | null;
    return { plans, email: cfg?.email ?? "hola@aivoxgroup.com", phone: cfg?.phone ?? null };
  } catch {
    return { plans: [], email: "hola@aivoxgroup.com", phone: null };
  }
}

export default function Home() {
  const { plans, email, phone } = getData();

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
    { icon: "📄", t: "Documentos legales", d: "Política de datos y términos enviados automáticamente al inicio de cada chat." },
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
    { e: "📅", t: "Reservas desorganizadas", d: "Agendas en papel, mensajes perdidos y clientes sin confirmación." },
    { e: "💸", t: "Sin claridad financiera", d: "No sabes cuánto ingresaste este mes ni qué está pendiente de cobro." },
    { e: "📱", t: "Redes sociales descuidadas", d: "No tienes tiempo para publicar contenido que atraiga nuevos clientes." },
    { e: "🔄", t: "Todo manual y lento", d: "Copiar datos, enviar confirmaciones, recordar pagos — todo a mano." },
  ];

  const moduleList: Record<string, string> = {
    chat: "Chat WhatsApp", crm: "CRM Pipeline", calendar: "Calendario reservas",
    accounting: "Contabilidad", products: "Catálogo productos", campaigns: "Email marketing",
    documents: "Documentos legales", analytics: "Analytics", suppliers: "Proveedores",
  };

  const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        *{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;overflow-x:hidden;-webkit-text-size-adjust:100%}
        a{text-decoration:none;color:inherit}
        img{max-width:100%;height:auto}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}

        /* NAV */
        .nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:.9rem 1.5rem;display:flex;align-items:center;justify-content:space-between;background:rgba(10,8,24,0.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.07)}
        .nav-brand{display:flex;align-items:center;gap:10px;color:white;font-weight:800;font-size:1.1rem}
        .nav-box{width:30px;height:30px;background:linear-gradient(135deg,#1e1b4b,#0077b6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;color:white;font-size:13px;flex-shrink:0}
        .nav-right{display:flex;align-items:center;gap:.5rem}
        .nav-link{color:rgba(255,255,255,0.7);padding:.4rem .8rem;border-radius:8px;font-size:.88rem;font-weight:500}
        .nav-link:hover{color:white;background:rgba(255,255,255,0.08)}
        .nav-cta{background:linear-gradient(135deg,#0077b6,#005f8c);color:white;padding:.45rem 1.1rem;border-radius:10px;font-weight:700;font-size:.88rem}

        /* HERO */
        .hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:7rem 1.5rem 4rem;background:linear-gradient(135deg,#0a0818 0%,#1e1b4b 55%,#0c2a4a 100%);position:relative;overflow:hidden}
        .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(0,119,182,.15),transparent 60%),radial-gradient(ellipse at 80% 50%,rgba(99,102,241,.1),transparent 60%);pointer-events:none}
        .hero-inner{position:relative;max-width:860px;margin:0 auto;width:100%}
        .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:100px;padding:5px 16px;font-size:.82rem;color:rgba(255,255,255,0.75);margin-bottom:1.8rem}
        .dot{width:7px;height:7px;background:#10b981;border-radius:50%;display:inline-block;animation:pulse 2s infinite;flex-shrink:0}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .hero h1{font-size:clamp(2rem,7vw,4.2rem);font-weight:900;color:white;line-height:1.1;margin-bottom:1.3rem}
        .grad{background:linear-gradient(90deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .hero-desc{font-size:clamp(.95rem,2.5vw,1.2rem);color:rgba(255,255,255,.65);max-width:620px;margin:0 auto 2.2rem;line-height:1.7}
        .btns{display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;margin-bottom:3rem}
        .btn-main{background:linear-gradient(135deg,#0077b6,#005f8c);color:white;padding:.9rem 2rem;border-radius:13px;font-weight:700;font-size:1rem;transition:transform .2s,opacity .2s;display:inline-block}
        .btn-main:hover{opacity:.9;transform:translateY(-1px)}
        .btn-sec{border:2px solid rgba(255,255,255,.25);color:rgba(255,255,255,.8);padding:.9rem 2rem;border-radius:13px;font-weight:600;font-size:1rem;display:inline-block;transition:border-color .2s}
        .btn-sec:hover{border-color:rgba(255,255,255,.5);color:white}
        .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;max-width:360px;margin:0 auto}
        .stat-n{font-size:1.8rem;font-weight:900;color:white}
        .stat-l{font-size:.72rem;color:rgba(255,255,255,.4);margin-top:3px}

        /* SECTIONS */
        .section{padding:4.5rem 1.5rem}
        .container{max-width:1080px;margin:0 auto}
        .tc{text-align:center}
        .label{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.6rem;display:block}
        .title{font-size:clamp(1.7rem,4vw,2.8rem);font-weight:900;line-height:1.15;margin-bottom:.8rem}
        .sub{font-size:1rem;color:#6b7280;max-width:560px;margin:0 auto;line-height:1.7}

        /* GRIDS */
        .grid-3{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.25rem;margin-top:2.5rem}
        .grid-4{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin-top:2.5rem}
        .grid-steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2rem;margin-top:2.5rem}

        /* CARDS */
        .card{background:white;border-radius:16px;padding:1.5rem;border:1px solid #e5e7eb;transition:border-color .2s,box-shadow .2s}
        .card:hover{border-color:#bfdbfe;box-shadow:0 4px 20px rgba(0,119,182,.07)}
        .card-icon{font-size:2rem;margin-bottom:.9rem}
        .card-title{font-weight:700;color:#111;font-size:1rem;margin-bottom:.35rem}
        .card-desc{color:#6b7280;font-size:.88rem;line-height:1.6}
        .feat-card{padding:1.4rem;border-radius:15px;border:1px solid #f3f4f6;transition:all .2s}
        .feat-card:hover{border-color:#bfdbfe;background:#f0f9ff}
        .feat-icon{width:44px;height:44px;border-radius:11px;background:linear-gradient(135deg,#ede9fe,#dbeafe);display:flex;align-items:center;justify-content:center;font-size:1.3rem;margin-bottom:.9rem}
        .feat-title{font-weight:700;margin-bottom:.35rem;font-size:.95rem}
        .feat-desc{color:#6b7280;font-size:.85rem;line-height:1.6}

        /* HOW */
        .how{background:linear-gradient(135deg,#0a0818,#1e1b4b);color:white}
        .how .label{color:#60a5fa}
        .how .title{color:white}
        .how .sub{color:rgba(255,255,255,.5)}
        .step-n{width:52px;height:52px;border-radius:13px;background:linear-gradient(135deg,#0077b6,#005f8c);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:900;color:white;margin:0 auto .9rem}
        .step-title{color:white;font-weight:700;margin-bottom:.4rem;text-align:center;font-size:.95rem}
        .step-desc{color:rgba(255,255,255,.5);font-size:.85rem;line-height:1.6;text-align:center}

        /* EXTENSIONS */
        .ext-card{background:white;border-radius:16px;padding:1.75rem;border:2px solid #e5e7eb;position:relative}
        .ext-badge{position:absolute;top:1rem;right:1rem;background:#fef3c7;color:#92400e;font-size:.65rem;font-weight:700;padding:3px 10px;border-radius:100px;text-transform:uppercase}
        .ext-icon{font-size:2.2rem;margin-bottom:.9rem}
        .ext-title{font-weight:800;font-size:1rem;margin-bottom:.4rem}
        .ext-desc{color:#6b7280;font-size:.88rem;line-height:1.6}

        /* FOOTER */
        .footer{background:#0a0818;color:white;padding:3.5rem 1.5rem 1.5rem}
        .footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:2.5rem;max-width:1080px;margin:0 auto 2.5rem}
        .footer-brand{font-weight:700;font-size:1.1rem;display:flex;align-items:center;gap:10px;margin-bottom:.9rem}
        .footer-desc{color:rgba(255,255,255,.4);font-size:.88rem;line-height:1.7;max-width:300px}
        .footer-col h4{color:rgba(255,255,255,.4);font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.9rem}
        .footer-col a{display:block;color:rgba(255,255,255,.55);font-size:.88rem;margin-bottom:.5rem;transition:color .2s}
        .footer-col a:hover{color:white}
        .footer-bottom{max-width:1080px;margin:0 auto;padding-top:1.5rem;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem}
        .footer-bottom p{color:rgba(255,255,255,.25);font-size:.78rem}

        /* MOBILE */
        @media(max-width:640px){
          .nav{padding:.75rem 1rem}
          .nav-link.hide-sm{display:none}
          .hero{padding:5.5rem 1.2rem 3rem}
          .hero h1{font-size:2rem}
          .badge{font-size:.75rem;padding:4px 12px}
          .btns{flex-direction:column;align-items:center}
          .btn-main,.btn-sec{width:100%;max-width:300px;text-align:center;padding:.85rem 1.5rem}
          .stats{gap:1rem}
          .stat-n{font-size:1.5rem}
          .section{padding:3.5rem 1.2rem}
          .grid-3{grid-template-columns:1fr}
          .grid-4{grid-template-columns:1fr 1fr}
          .grid-steps{grid-template-columns:1fr 1fr}
          .footer-grid{grid-template-columns:1fr}
          .footer-bottom{flex-direction:column;text-align:center}
          .ext-card{padding:1.4rem}
        }
        @media(max-width:400px){
          .grid-4{grid-template-columns:1fr}
          .grid-steps{grid-template-columns:1fr}
        }
      `}} />

      <span className="sr-only">automatización whatsapp colombia chatbot whatsapp pymes crm whatsapp ia negocios aivox</span>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-box">A</div>
          Aivox
        </div>
        <div className="nav-right">
          <a href="#funciones" className="nav-link hide-sm">Funciones</a>
          <a href="#planes" className="nav-link hide-sm">Planes</a>
          <a href="/login" className="nav-link">Ingresar</a>
          <a href="/register" className="nav-cta">Empezar →</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-inner">
          <div className="badge"><span className="dot" />+100 negocios automatizados en LATAM</div>
          <h1>Tu negocio vendiendo<br /><span className="grad">24/7 por WhatsApp</span></h1>
          <p className="hero-desc">Aivox convierte tu WhatsApp en un vendedor automático con IA. Responde clientes, gestiona reservas, registra pagos y publica en redes — sin que tú hagas nada.</p>
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

      {/* PROBLEMAS */}
      <section className="section" id="problemas" style={{background:"#f9fafb"}}>
        <div className="container">
          <div className="tc">
            <span className="label" style={{color:"#ef4444"}}>¿Te suena familiar?</span>
            <div className="title">Problemas que Aivox resuelve hoy</div>
            <div className="sub">Cada uno de estos problemas le está costando dinero a tu negocio todos los días.</div>
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
          <div className="tc" style={{marginTop:"2.5rem"}}>
            <p style={{fontSize:"1.15rem",fontWeight:700}}>¿Reconoces alguno? <span style={{color:"#0077b6"}}>Aivox los elimina todos.</span></p>
          </div>
        </div>
      </section>

      {/* FUNCIONES */}
      <section className="section" id="funciones" style={{background:"white"}}>
        <div className="container">
          <div className="tc">
            <span className="label" style={{color:"#0077b6"}}>Todo en uno</span>
            <div className="title">Una plataforma. Todos los procesos.</div>
            <div className="sub">Desde el primer mensaje hasta el pago confirmado — completamente automatizado.</div>
          </div>
          <div className="grid-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="feat-card">
                <div className="feat-icon">{f.icon}</div>
                <div className="feat-title">{f.t}</div>
                <div className="feat-desc">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="section how" id="como-funciona">
        <div className="container">
          <div className="tc">
            <span className="label">Simple y rápido</span>
            <div className="title">Empieza en 4 pasos</div>
            <div className="sub">Sin código, sin técnicos, sin complicaciones.</div>
          </div>
          <div className="grid-steps">
            {STEPS.map((s, i) => (
              <div key={i}>
                <div className="step-n">{s.n}</div>
                <div className="step-title">{s.t}</div>
                <div className="step-desc">{s.d}</div>
              </div>
            ))}
          </div>
          <div className="tc" style={{marginTop:"2.5rem"}}>
            <a href="/register" className="btn-main" style={{fontSize:"1rem",padding:"1rem 2.5rem"}}>
              Quiero automatizar mi negocio →
            </a>
          </div>
        </div>
      </section>

      {/* EXTENSIONES */}
      <section className="section" id="extensiones" style={{background:"#f9fafb"}}>
        <div className="container">
          <div className="tc">
            <span className="label" style={{color:"#d97706"}}>Funcionalidades adicionales</span>
            <div className="title">Extensiones para potenciar tu plan</div>
            <div className="sub">Actívalas cuando las necesites. Sin cambiar tu plan base.</div>
          </div>
          <div className="grid-3" style={{marginTop:"2.5rem"}}>
            {EXTENSIONS.map((e, i) => (
              <div key={i} className="ext-card">
                <span className="ext-badge">Extensión</span>
                <div className="ext-icon">{e.icon}</div>
                <div className="ext-title">{e.t}</div>
                <div className="ext-desc">{e.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANES */}
      <section className="section" id="planes" style={{background:"white"}}>
        <div className="container">
          <div className="tc">
            <span className="label" style={{color:"#0077b6"}}>Precios transparentes</span>
            <div className="title">Planes para cada negocio</div>
            <div className="sub">Sin permanencia. Cancela cuando quieras.</div>
          </div>
          <PricingSection plans={plans} moduleList={moduleList} />
        </div>
      </section>

      {/* CTA */}
      <section className="section tc" style={{background:"#f9fafb"}}>
        <div className="container" style={{maxWidth:"680px"}}>
          <div className="title">Tu negocio merece trabajar<br />mientras tú descansas</div>
          <p style={{color:"#6b7280",fontSize:"1.05rem",margin:"1.2rem 0 2.2rem",lineHeight:1.7}}>
            Configura en 5 minutos. Sin tarjeta de crédito, sin permanencia.
          </p>
          <div className="btns" style={{justifyContent:"center"}}>
            <a href="/register" className="btn-main" style={{fontSize:"1rem",padding:"1rem 2.5rem"}}>Crear mi cuenta gratis →</a>
            <a href="/login" className="btn-sec" style={{fontSize:"1rem",padding:"1rem 2.5rem"}}>Ya tengo cuenta</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand"><div className="nav-box">A</div>Aivox</div>
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
            <a href={`mailto:${email}`}>{email}</a>
            {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            <span style={{color:"rgba(255,255,255,.25)",fontSize:".83rem",display:"block",marginTop:".3rem"}}>Colombia · LATAM</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Aivox Group. Todos los derechos reservados.</p>
          <p>Automatización WhatsApp · CRM · Reservas · IA · LATAM</p>
        </div>
      </footer>
    </>
  );
}
