export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    version: "2026-05-18-omnichannel",
    channels: ["whatsapp", "facebook", "instagram"],
    facebook_webhook: true,
    timestamp: new Date().toISOString(),
  });
}
