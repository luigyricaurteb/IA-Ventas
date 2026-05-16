import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignById, updateCampaign, getContactsForCampaign,
  insertCampaignRecipients, getPendingRecipients, updateRecipientStatus,
  getCompanyConfig,
} from "@/lib/db";
import { sendEmail, renderTemplate } from "@/lib/email";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = getCampaignById(campaignId);
  if (!campaign) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (campaign.status === "sent") {
    return NextResponse.json({ error: "Esta campaña ya fue enviada" }, { status: 400 });
  }

  updateCampaign(campaignId, { status: "sending" });

  // Construir lista de destinatarios
  const contacts = getContactsForCampaign(campaign.target_stage);
  if (contacts.length === 0) {
    updateCampaign(campaignId, { status: "draft" });
    return NextResponse.json({ error: "No hay contactos con email en el segmento seleccionado" }, { status: 400 });
  }

  insertCampaignRecipients(campaignId, contacts);

  const company = getCompanyConfig();
  let sent = 0;
  let failed = 0;

  const pending = getPendingRecipients(campaignId, 500);

  for (const recipient of pending) {
    const contact = contacts.find((c) => c.id === recipient.contact_id);
    const html = renderTemplate(campaign.body_html, {
      nombre: contact?.full_name ?? "Cliente",
      empresa: company.name ?? "",
      email: recipient.email,
    });
    try {
      await sendEmail(recipient.email, campaign.subject, html);
      updateRecipientStatus(recipient.id, "sent");
      sent++;
    } catch (err) {
      updateRecipientStatus(recipient.id, "failed", String(err));
      failed++;
    }
    // Pequeña pausa entre emails para no saturar el SMTP
    await new Promise((r) => setTimeout(r, 100));
  }

  updateCampaign(campaignId, {
    status: "sent",
    sent_at: Math.floor(Date.now() / 1000),
    recipients_count: sent,
  });

  return NextResponse.json({ ok: true, sent, failed });
}
