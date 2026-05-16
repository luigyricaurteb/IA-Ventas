import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const conversations = db.prepare(`
    SELECT c.*, (
      SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    ) as last_message_preview
    FROM conversations c
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  `).all();

  return NextResponse.json({ conversations });
}
