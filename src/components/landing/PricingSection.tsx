"use client";
import { useState } from "react";

interface Plan {
  id: number; name: string; description: string | null;
  price_monthly: number; price_usd: number; billing_cycle: string;
  modules: string; max_users: number;
}

export default function PricingSection({ plans, moduleList }: { plans: Plan[]; moduleList: Record<string, string> }) {
  const [billing, setBilling] = useState<"cop" | "usd">("cop");

  const styles = `
    .pricing-toggle{display:inline-flex;background:#f3f4f6;border-radius:12px;padding:4px;margin:2rem 0 3rem}
    .tog-btn{padding:.5rem 1.5rem;border-radius:9px;font-size:.9rem;font-weight:600;border:none;cursor:pointer;transition:all .2s;background:transparent;color:#6b7280}
    .tog-btn.active{background:white;color:#111;box-shadow:0 1px 4px rgba(0,0,0,.1)}
    .plans-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem}
    .plan-card{background:white;border-radius:20px;padding:2rem;border:2px solid #e5e7eb;position:relative;transition:all .2s}
    .plan-card:hover{border-color:#bfdbfe;box-shadow:0 8px 30px rgba(0,119,182,.1)}
    .plan-card.popular{border-color:#0077b6;box-shadow:0 8px 30px rgba(0,119,182,.15);transform:scale(1.03)}
    .popular-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#0077b6;color:white;font-size:.7rem;font-weight:700;padding:4px 16px;border-radius:100px;white-space:nowrap}
    .plan-name{font-size:1.2rem;font-weight:800;margin-bottom:.3rem}
    .plan-desc{color:#6b7280;font-size:.85rem;margin-bottom:1.5rem}
    .plan-price{font-size:2.5rem;font-weight:900;line-height:1}
    .plan-cycle{color:#6b7280;font-size:.85rem}
    .plan-features{margin:1.5rem 0}
    .plan-feat{display:flex;align-items:flex-start;gap:.5rem;font-size:.9rem;color:#374151;margin-bottom:.5rem}
    .check{color:#10b981;font-size:1rem;flex-shrink:0;margin-top:1px}
    .plan-btn{display:block;text-align:center;padding:.85rem;border-radius:12px;font-weight:700;font-size:.95rem;margin-top:1.5rem;transition:opacity .2s}
    .plan-btn:hover{opacity:.88}
    .plan-btn.primary{background:linear-gradient(135deg,#1e1b4b,#0077b6);color:white}
    .plan-btn.secondary{border:2px solid #e5e7eb;color:#374151}
    .plan-btn.secondary:hover{border-color:#0077b6;color:#0077b6}
    .user-limit{display:flex;align-items:center;gap:.5rem;font-size:.9rem;color:#374151;margin-bottom:.5rem}
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div style={{ textAlign: "center" }}>
        <div className="pricing-toggle">
          <button className={`tog-btn ${billing === "cop" ? "active" : ""}`} onClick={() => setBilling("cop")}>COP</button>
          <button className={`tog-btn ${billing === "usd" ? "active" : ""}`} onClick={() => setBilling("usd")}>USD</button>
        </div>
      </div>

      {plans.length === 0 ? (
        <p style={{ textAlign: "center", color: "#9ca3af", padding: "3rem 0" }}>Cargando planes...</p>
      ) : (
        <div className="plans-grid">
          {plans.map((plan, i) => {
            let mods: Record<string, unknown> = {};
            try { mods = JSON.parse(plan.modules || "{}"); } catch {}
            const isPopular = i === 1;
            const price = billing === "cop"
              ? plan.price_monthly
              : (plan.price_usd > 0 ? plan.price_usd : Math.round(plan.price_monthly / 4200));
            const priceStr = billing === "cop"
              ? `$${price.toLocaleString("es-CO")}`
              : `$${price}`;

            return (
              <div key={plan.id} className={`plan-card ${isPopular ? "popular" : ""}`}>
                {isPopular && <div className="popular-badge">MÁS POPULAR</div>}
                <div className="plan-name">{plan.name}</div>
                <div className="plan-desc">{plan.description ?? "Perfecto para tu negocio"}</div>
                <div>
                  <span className="plan-price">{priceStr}</span>
                  <span className="plan-cycle"> /{billing === "cop" ? "mes" : "mo"}</span>
                </div>
                <div className="plan-features">
                  {Object.entries(mods).filter(([, v]) => v).map(([k]) => (
                    <div key={k} className="plan-feat">
                      <span className="check">✓</span>
                      {moduleList[k] ?? k}
                    </div>
                  ))}
                  <div className="user-limit">
                    <span className="check">✓</span>
                    Hasta {plan.max_users} usuario{plan.max_users !== 1 ? "s" : ""}
                  </div>
                </div>
                <a href="/register" className={`plan-btn ${isPopular ? "primary" : "secondary"}`}>
                  Empezar con {plan.name}
                </a>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ textAlign: "center", marginTop: "2rem", color: "#9ca3af", fontSize: ".9rem" }}>
        ¿Necesitas algo personalizado?{" "}
        <a href="mailto:hola@aivoxgroup.com" style={{ color: "#0077b6", fontWeight: 600 }}>Escríbenos →</a>
      </p>
    </>
  );
}
