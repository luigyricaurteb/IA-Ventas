/**
 * PDF público por código de reserva — sin autenticación.
 * El código de reserva actúa como token secreto (RES-timestamp-random).
 * GET /api/pdf/public?code=RES-xxx
 */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import masterDb from "@/lib/master/db-master";
import { getCompanyDb } from "@/lib/master/db-company";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code || !code.startsWith("RES-")) {
    return new NextResponse("Código inválido", { status: 400 });
  }

  // Find which company owns this reservation
  const companies = masterDb.prepare("SELECT slug FROM companies WHERE active=1").all() as { slug: string }[];

  let db = null;
  let reservation = null;

  for (const { slug } of companies) {
    try {
      const cdb = getCompanyDb(slug);
      const r = cdb.prepare("SELECT * FROM reservations WHERE reservation_code=? LIMIT 1").get(code);
      if (r) { db = cdb; reservation = r; break; }
    } catch {}
  }

  if (!db || !reservation) {
    return new NextResponse("Reserva no encontrada", { status: 404 });
  }

  const res = reservation as {
    id: number; reservation_code: string; client_name: string | null;
    service_name: string | null; service_date: number; people_count: number;
    service_price: number | null; discount: number; total_value: number | null;
    amount_paid: number; notes: string | null; status: string;
  };

  const company = db.prepare("SELECT * FROM company_config WHERE id=1").get() as {
    name: string | null; phone: string | null; email: string | null;
    nequi_phone: string | null; daviplata_phone: string | null; logo_filename: string | null;
  } | null ?? { name: null, phone: null, email: null, nequi_phone: null, daviplata_phone: null, logo_filename: null };

  const contact = db.prepare(
    "SELECT c.full_name, c.email, conv.phone FROM reservations r LEFT JOIN contacts c ON r.contact_id = c.id LEFT JOIN conversations conv ON c.conversation_id = conv.id WHERE r.id = ?"
  ).get(res.id) as { full_name: string | null; email: string | null; phone: string | null } | null;

  // QR apunta a este mismo recibo (el cliente puede compartirlo o verificarlo)
  const selfUrl = `${req.nextUrl.origin}/api/pdf/public?code=${code}`;
  const qrDataUrl = await QRCode.toDataURL(selfUrl, { width: 120, margin: 1 });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  const logoPath = company.logo_filename
    ? path.join(process.cwd(), "public", "uploads", "logos", company.logo_filename)
    : null;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 595 - 100;
    const accentColor = "#0077b6";

    // Header
    if (logoPath && fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { height: 50, fit: [150, 50] });
    }
    doc.fillColor(accentColor).fontSize(22).font("Helvetica-Bold")
       .text(company.name ?? "Aivox", logoPath ? 210 : 50, 45, { align: logoPath ? "left" : "right", width: W });
    doc.fillColor("#6b7280").fontSize(9).font("Helvetica")
       .text([company.phone, company.email].filter(Boolean).join("  ·  "), 50, 100, { align: "right", width: W });

    doc.moveTo(50, 115).lineTo(545, 115).strokeColor(accentColor).lineWidth(2).stroke();

    // Título
    doc.fillColor("#111827").fontSize(18).font("Helvetica-Bold")
       .text("RECIBO DE RESERVA", 50, 130, { align: "center", width: W });
    doc.fillColor(accentColor).fontSize(13).font("Helvetica-Bold")
       .text(code, 50, 152, { align: "center", width: W });

    // QR
    doc.image(qrBuffer, 450, 130, { width: 90 });
    doc.fillColor("#9ca3af").fontSize(7).text("Verificación", 450, 224, { width: 90, align: "center" });

    // Datos del cliente
    let y = 200;
    doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold").text("DATOS DEL CLIENTE", 50, y); y += 16;
    for (const [label, value] of [
      ["Nombre", res.client_name ?? contact?.full_name],
      ["Correo", contact?.email],
      ["Teléfono", contact?.phone],
    ] as [string, string | null | undefined][]) {
      if (!value) continue;
      doc.font("Helvetica-Bold").fillColor("#6b7280").fontSize(9).text(label + ": ", 50, y, { continued: true });
      doc.font("Helvetica").fillColor("#111827").text(value); y += 14;
    }

    // Detalles del servicio
    y += 10;
    doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold").text("DETALLES DEL SERVICIO", 50, y); y += 5;
    doc.moveTo(50, y + 11).lineTo(545, y + 11).strokeColor("#e5e7eb").lineWidth(1).stroke(); y += 16;

    const serviceDate = new Date(res.service_date * 1000).toLocaleDateString("es-CO", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    for (const [label, value] of [
      ["Servicio", res.service_name ?? "—"],
      ["Fecha", serviceDate],
      ["Personas", String(res.people_count)],
      ["Estado", res.status === "confirmed" ? "✅ Confirmada" : res.status === "pending" ? "⏳ Pendiente" : res.status],
    ] as [string, string][]) {
      doc.rect(50, y - 2, W, 18).fillColor("#f9fafb").fill();
      doc.font("Helvetica-Bold").fillColor("#6b7280").fontSize(9).text(label + ":", 55, y, { width: 120 });
      doc.font("Helvetica").fillColor("#111827").text(value, 175, y, { width: W - 130 });
      y += 20;
    }

    // Resumen financiero
    const total = res.total_value ?? 0;
    const paid = res.amount_paid ?? 0;
    const saldo = Math.max(0, total - paid);

    if (total > 0) {
      y += 8;
      doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold").text("RESUMEN DE PAGO", 50, y); y += 16;

      if (res.service_price && res.people_count > 1) {
        doc.rect(50, y - 2, W, 18).fillColor("#f9fafb").fill();
        doc.font("Helvetica-Bold").fillColor("#6b7280").fontSize(9).text(`Precio/persona × ${res.people_count}:`, 55, y, { width: 250 });
        doc.font("Helvetica").fillColor("#111827").text(`$${(res.service_price * res.people_count).toLocaleString("es-CO")}`, 310, y, { width: W - 265, align: "right" }); y += 20;
      }
      if ((res.discount ?? 0) > 0) {
        doc.rect(50, y - 2, W, 18).fillColor("#fff7ed").fill();
        doc.font("Helvetica-Bold").fillColor("#ea580c").fontSize(9).text("Descuento:", 55, y, { width: 250 });
        doc.font("Helvetica").fillColor("#ea580c").text(`- $${res.discount.toLocaleString("es-CO")}`, 310, y, { width: W - 265, align: "right" }); y += 20;
      }

      doc.rect(50, y, W, 28).fillColor(accentColor).fill();
      doc.font("Helvetica-Bold").fillColor("white").fontSize(11).text("TOTAL:", 55, y + 8, { width: 200 });
      doc.text(`$${total.toLocaleString("es-CO")} COP`, 55, y + 8, { width: W - 10, align: "right" }); y += 36;

      if (paid > 0) {
        doc.rect(50, y - 2, W, 18).fillColor("#d1fae5").fill();
        doc.font("Helvetica-Bold").fillColor("#065f46").fontSize(9).text("✓ Pagado:", 55, y, { width: 200 });
        doc.text(`$${paid.toLocaleString("es-CO")} COP`, 55, y, { width: W - 10, align: "right" }); y += 22;
      }
      if (saldo > 0) {
        doc.rect(50, y - 2, W, 22).fillColor("#fef3c7").fill();
        doc.font("Helvetica-Bold").fillColor("#92400e").fontSize(10).text("⚠ SALDO PENDIENTE:", 55, y + 4, { width: 200 });
        doc.text(`$${saldo.toLocaleString("es-CO")} COP`, 55, y + 4, { width: W - 10, align: "right" }); y += 28;
      } else if (paid > 0) {
        doc.rect(50, y - 2, W, 18).fillColor("#d1fae5").fill();
        doc.font("Helvetica-Bold").fillColor("#065f46").fontSize(9).text("✅ PAGADO EN SU TOTALIDAD", 55, y, { width: W - 10, align: "center" }); y += 22;
      }
    }

    if (res.notes) {
      y += 5;
      doc.fillColor("#6b7280").fontSize(8).font("Helvetica-Oblique").text("Notas: " + res.notes, 50, y, { width: W }); y += 20;
    }

    doc.moveTo(50, 730).lineTo(545, 730).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.fillColor("#9ca3af").fontSize(8).font("Helvetica")
       .text(`Generado el ${new Date().toLocaleDateString("es-CO")} · ${company.name ?? "Aivox"} · ${code}`, 50, 738, { align: "center", width: W });

    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-${code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
