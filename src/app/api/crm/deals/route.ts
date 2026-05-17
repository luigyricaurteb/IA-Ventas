import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const deals = db.prepare(`
    SELECT d.*,
           COALESCE(c.full_name, conv.name) as contact_name,
           c.email as contact_email,
           conv.phone as contact_phone,
           p.name as product_name
    FROM crm_deals d
    LEFT JOIN contacts c ON d.contact_id = c.id
    LEFT JOIN conversations conv ON d.conversation_id = conv.id
    LEFT JOIN products p ON d.product_id = p.id
    ORDER BY d.updated_at DESC
  `).all();

  return NextResponse.json({ deals });
}
