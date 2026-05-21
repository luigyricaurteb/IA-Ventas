export default function Home() {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Aivox — Automatiza tu negocio con IA y WhatsApp</title>
        <meta name="description" content="Plataforma SaaS de automatización WhatsApp con IA para PYMES latinoamericanas." />
        <style dangerouslySetInnerHTML={{ __html: `
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: system-ui, -apple-system, sans-serif; background:#0a0818; color:white; }
          .hero { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:2rem; background:linear-gradient(135deg,#0a0818,#1e1b4b,#0c2a4a); }
          .logo { width:60px; height:60px; background:linear-gradient(135deg,#1e1b4b,#0077b6); border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:900; margin:0 auto 1.5rem; }
          h1 { font-size:clamp(2rem,6vw,4rem); font-weight:900; margin-bottom:1.5rem; line-height:1.1; }
          .blue { color:#38bdf8; }
          p { font-size:1.2rem; color:rgba(255,255,255,0.7); max-width:600px; margin:0 auto 2.5rem; line-height:1.6; }
          .btns { display:flex; gap:1rem; flex-wrap:wrap; justify-content:center; }
          .btn-main { background:linear-gradient(135deg,#0077b6,#005f8c); color:white; padding:1rem 2.5rem; border-radius:12px; font-weight:700; font-size:1.1rem; text-decoration:none; }
          .btn-sec { border:2px solid rgba(255,255,255,0.3); color:rgba(255,255,255,0.8); padding:1rem 2.5rem; border-radius:12px; font-weight:600; font-size:1.1rem; text-decoration:none; }
          .nav { position:fixed; top:0; left:0; right:0; padding:1.2rem 2rem; display:flex; align-items:center; justify-content:space-between; z-index:100; }
          .nav-logo { display:flex; align-items:center; gap:10px; font-weight:700; font-size:1.2rem; }
          .nav-logo-box { width:32px; height:32px; background:linear-gradient(135deg,#1e1b4b,#0077b6); border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:14px; }
          .nav-links { display:flex; gap:1rem; }
          .nav-links a { color:rgba(255,255,255,0.7); text-decoration:none; padding:0.5rem 1rem; border-radius:8px; font-weight:500; }
          .nav-links a:hover { color:white; background:rgba(255,255,255,0.1); }
          .login-btn { background:rgba(255,255,255,0.1); color:white; padding:0.5rem 1.2rem; border-radius:8px; text-decoration:none; font-weight:600; }
          .badge { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:100px; padding:6px 16px; font-size:0.85rem; color:rgba(255,255,255,0.8); margin-bottom:2rem; }
          .dot { width:8px; height:8px; background:#10b981; border-radius:50%; display:inline-block; animation:pulse 2s infinite; }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
          .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:2rem; max-width:400px; margin:3rem auto 0; }
          .stat p { font-size:1.8rem; font-weight:900; }
          .stat span { font-size:0.75rem; color:rgba(255,255,255,0.5); }
        `}} />
      </head>
      <body>
        <nav className="nav">
          <div className="nav-logo">
            <div className="nav-logo-box">A</div>
            Aivox
          </div>
          <div className="nav-links">
            <a href="/login" className="login-btn">Iniciar sesión</a>
            <a href="/register" style={{background:"linear-gradient(135deg,#0077b6,#005f8c)",color:"white",padding:"0.5rem 1.2rem",borderRadius:"8px",textDecoration:"none",fontWeight:"700"}}>Registrarse →</a>
          </div>
        </nav>
        <section className="hero">
          <div className="badge"><span className="dot" />Más de 100 negocios automatizados en LATAM</div>
          <div className="logo">A</div>
          <h1>Tu negocio vendiendo<br /><span className="blue">24/7 por WhatsApp</span></h1>
          <p>Aivox convierte tu WhatsApp en un vendedor automático con IA. Responde clientes, gestiona reservas, registra pagos y publica en redes — sin que tú hagas nada.</p>
          <div className="btns">
            <a href="/register" className="btn-main">Empezar gratis →</a>
            <a href="/login" className="btn-sec">Ya tengo cuenta</a>
          </div>
          <div className="stats">
            <div className="stat"><p>24/7</p><span>Atención automática</span></div>
            <div className="stat"><p>5 min</p><span>Para configurar</span></div>
            <div className="stat"><p>$0</p><span>Costo inicial</span></div>
          </div>
        </section>
      </body>
    </html>
  );
}
