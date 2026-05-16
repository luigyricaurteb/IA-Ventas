import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getMasterUser } from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  if (!token) return NextResponse.json({ user: null }, { status: 401 });

  const auth = getUserFromToken(token);
  if (!auth) return NextResponse.json({ user: null }, { status: 401 });

  // Master
  if (auth.role === "master") {
    const master = getMasterUser("master");
    if (!master) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { id: auth.sub, username: "master", name: master.name, role: "master", isMaster: true } });
  }

  // Company user
  if (!auth.company) return NextResponse.json({ user: null }, { status: 401 });
  try {
    const db   = getCompanyDb(auth.company);
    const user = db.prepare("SELECT id, username, name, permissions, is_admin, active FROM users WHERE id=?").get(Number(auth.sub)) as {
      id: number; username: string; name: string; permissions: string; is_admin: number; active: number;
    } | null;
    if (!user || !user.active) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({
      user: {
        id: user.id, username: user.username, name: user.name,
        permissions: auth.permissions ?? JSON.parse(user.permissions || "{}"),
        is_admin: Boolean(user.is_admin),
        company: auth.company, isMaster: false,
      }
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
