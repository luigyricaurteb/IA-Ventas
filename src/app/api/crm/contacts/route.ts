import { NextResponse } from "next/server";
import { listContacts } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const contacts = listContacts();
  return NextResponse.json({ contacts });
}
