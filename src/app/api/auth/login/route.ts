import { NextRequest, NextResponse } from "next/server";
import { loginMaster, loginCompanyUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown";
  const body = await req.json();
  const { username, password, company: companySlug, isMaster } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Usuario y contraseña requeridos" }, { status: 400 });
  }

  let result: { token: string; user: unknown } | null = null;

  if (isMaster || !companySlug) {
    // Master siempre opera sobre la empresa "platform"
    result = await loginMaster(username, password, ip, "platform");
  } else {
    result = await loginCompanyUser(companySlug, username, password, ip);
  }

  if (!result) {
    return NextResponse.json({ error: "Credenciales incorrectas o cuenta suspendida" }, { status: 401 });
  }

  const res = NextResponse.json({ user: result.user });
  res.cookies.set("session_token", result.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 86400,
    path: "/",
  });
  return res;
}
