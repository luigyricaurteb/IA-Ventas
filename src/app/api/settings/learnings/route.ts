import { NextRequest, NextResponse } from "next/server";
import { listAiLearnings, insertAiLearning } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ learnings: listAiLearnings() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.topic || !body.content) {
    return NextResponse.json({ error: "Tema y contenido requeridos" }, { status: 400 });
  }
  const learning = insertAiLearning(body.topic.trim(), body.content.trim());
  return NextResponse.json({ learning }, { status: 201 });
}
