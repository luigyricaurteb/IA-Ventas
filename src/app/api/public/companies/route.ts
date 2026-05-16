import { NextResponse } from "next/server";
import { listCompanies } from "@/lib/master/db-master";

export const dynamic = "force-dynamic";

// Endpoint público — solo devuelve nombre y slug de empresas activas para el selector del login
export async function GET() {
  try {
    const all = listCompanies();
    const companies = all.map(c => ({ slug: c.slug, name: c.name, status: c.status }));
    return NextResponse.json({ companies });
  } catch {
    return NextResponse.json({ companies: [] });
  }
}
