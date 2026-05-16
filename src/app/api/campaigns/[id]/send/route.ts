import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import { renderTemplate } from "@/lib/email";
import nodemailer from "nodemailer";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const campaignId = Number(id);

  const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as {
    id: number; name: string; subject: string; body_html: string;
    target_stage: string | null; status: string; recipients_count: number;
  } | null;

  if (!campaign) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (campaign.status === "sent") {
    return NextResponse.json({ error: "Esta campaña ya fue enviada" }, { status: 400 });
  }

  db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(campaignId);

  // Construir lista de destinatarios
  const whereStage = campaign.target_stage
    ? "AND d.stage = ?"
    : "";
  const contactsArgs = campaign.target_stage ? [campaign.target_stage] : [];

  const contacts = db.prepare(`
    SELECT DISTINCT c.id, c.full_name, c.email
    FROM contacts c
    JOIN crm_deals d ON d.contact_id = c.id
    WHERE c.email IS NOT NULL AND c.email != ''
      AND c.unsubscribed = 0
      AND c.email NOT IN (SELECT email FROM email_unsubscribes)
      ${whereStage}
  `).all(...contactsArgs) as { id: number; full_name: string | null; email: string }[];

  if (contacts.length === 0) {
    db.prepare("UPDATE campaigns SET status = 'draft' WHERE id = ?").run(campaignId);
    return NextResponse.json({ error: "No hay contactos con email en el segmento seleccionado" }, { status: 400 });
  }

  // Insertar destinatarios
  const insertRecipient = db.prepare(
    "INSERT OR IGNORE INTO campaign_recipients (campaign_id, contact_id, email) VALUES (?, ?, ?)"
  );
  for (const c of contacts) {
    insertRecipient.run(campaignId, c.id, c.email);
  }

  // Obtener configuración empresa y SMTP
  const company = db.prepare("SELECT * FROM company_config WHERE id = 1").get() as {
    name: string | null;
  } | null;

  const smtpConfig = db.prepare("SELECT * FROM smtp_config WHERE id = 1").get() as {
    host: string | null; port: number; secure: number;
    user: string | null; password: string | null;
    from_name: string | null; from_email: string | null;
  } | null;

  let sent = 0;
  let failed = 0;

  if (smtpConfig?.host && smtpConfig?.user) {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure === 1,
      auth: { user: smtpConfig.user, pass: smtpConfig.password ?? "" },
    });

    const fromName  = smtpConfig.from_name  ?? smtpConfig.user;
    const fromEmail = smtpConfig.from_email ?? smtpConfig.user;

    const pending = db.prepare(
      "SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending' LIMIT 500"
    ).all(campaignId) as { id: number; contact_id: number; email: string }[];

    for (const recipient of pending) {
      const contact = contacts.find((c) => c.id === recipient.contact_id);
      const html = renderTemplate(campaign.body_html, {
        nombre: contact?.full_name ?? "Cliente",
        empresa: company?.name ?? "",
        email: recipient.email,
      });
      try {
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: recipient.email,
          subject: campaign.subject,
          html,
        });
        db.prepare(
          "UPDATE campaign_recipients SET status = 'sent', sent_at = unixepoch() WHERE id = ?"
        ).run(recipient.id);
        sent++;
      } catch (err) {
        db.prepare(
          "UPDATE campaign_recipients SET status = 'failed', error = ? WHERE id = ?"
        ).run(String(err), recipient.id);
        failed++;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  } else {
    failed = contacts.length;
  }

  db.prepare(
    "UPDATE campaigns SET status = 'sent', sent_at = unixepoch(), recipients_count = ? WHERE id = ?"
  ).run(sent, campaignId);

  return NextResponse.json({ ok: true, sent, failed });
}
