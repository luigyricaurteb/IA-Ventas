import { NextRequest, NextResponse } from "next/server";
import { listSubscriptions, createSubscription } from "@/lib/master/db-master";
import { getUserFromToken } from "@/lib/auth";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (auth?.role !== "master") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  return NextResponse.json({ subscriptions: listSubscriptions(companyId ? Number(companyId) : undefined) });
}

export async function POST(req: NextRequest) {
  const auth = getUserFromToken(req.cookies.get("session_token")?.value ?? "");
  if (auth?.role !== "master") return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};
  let proofFilename: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    for (const [k, v] of formData.entries()) {
      if (k !== "proof") body[k] = v;
    }
    const proof = formData.get("proof") as File | null;
    if (proof) {
      const bytes = await proof.arrayBuffer();
      const ext = proof.name.split(".").pop() ?? "pdf";
      proofFilename = `sub_proof_${Date.now()}.${ext}`;
      const dir = path.resolve(process.cwd(), "public", "uploads", "payment-proofs");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, proofFilename), Buffer.from(bytes));
    }
  } else {
    body = await req.json();
  }

  const now = Math.floor(Date.now()/1000);
  let endsAt: number | null = null;
  if (body.billing_cycle === "monthly") endsAt = now + 30*86400;
  else if (body.billing_cycle === "yearly") endsAt = now + 365*86400;

  const sub = createSubscription({
    company_id: Number(body.company_id),
    plan_id:    Number(body.plan_id),
    billing_cycle: String(body.billing_cycle ?? "monthly"),
    starts_at:  now,
    ends_at:    endsAt,
    status:     "pending",
    payment_proof_file: proofFilename,
    payment_amount: body.payment_amount ? Number(body.payment_amount) : null,
    notes:      body.notes ? String(body.notes) : null,
  });

  return NextResponse.json({ subscription: sub }, { status: 201 });
}
