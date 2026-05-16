import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  if (token) logout(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("session_token");
  return res;
}
