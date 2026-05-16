import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "Usuario y contraseña requeridos" }, { status: 400 });
  }

  const result = await loginUser(username, password);
  if (!result) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
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
