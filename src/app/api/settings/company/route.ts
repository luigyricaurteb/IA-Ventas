import { NextRequest, NextResponse } from "next/server";
import { getCompanyConfig, updateCompanyConfig } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ config: getCompanyConfig() });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const logoFile = formData.get("logo") as File | null;
    const updates: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (key !== "logo") updates[key] = value;
    }

    if (logoFile) {
      const bytes = await logoFile.arrayBuffer();
      const ext = logoFile.name.split(".").pop() ?? "png";
      const filename = `logo_${Date.now()}.${ext}`;
      const dir = path.resolve(process.cwd(), "public", "uploads", "logos");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), Buffer.from(bytes));
      updates.logo_filename = filename;
    }

    if (Object.keys(updates).length > 0) updateCompanyConfig(updates);
  } else {
    const body = await req.json();
    updateCompanyConfig(body);
  }
  return NextResponse.json({ config: getCompanyConfig() });
}
