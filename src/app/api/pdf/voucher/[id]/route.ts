export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthCtx, unauthorized } from "@/lib/api-helpers";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = getAuthCtx(req);
  if (!ctx) return unauthorized();
  const { db } = ctx;

  const { id } = await params;
  const resId = Number(id);

  const reservation = db.prepare(
    "SELECT * FROM reservations WHERE id = ?"
  ).get(resId) as {
    id: number; reservation_code: string | null; client_name: string | null;
    service_name: string | null; service_date: number; people_count: number;
    total_value: number | null; notes: string | null; status: string;
  } | null;

  if (!reservation) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  // Ensure reservation code
  let code = reservation.reservation_code;
  if (!code) {
    code = `RES-${resId}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    db.prepare("UPDATE reservations SET reservation_code = ? WHERE id = ?").run(code, resId);
  }

  const company = db.prepare("SELECT * FROM company_config WHERE id = 1").get() as {
    name: string | null; phone: string | null; email: string | null;
    nequi_phone: string | null; daviplata_phone: string | null; logo_filename: string | null;
  } | null ?? { name: null, phone: null, email: null, nequi_phone: null, daviplata_phone: null, logo_filename: null };

  // Datos del contacto
  const contact = db.prepare(
    "SELECT c.full_name, c.email, conv.phone FROM reservations r LEFT JOIN contacts c ON r.contact_id = c.id LEFT JOIN conversations conv ON c.conversation_id = conv.id WHERE r.id = ?"
  ).get(resId) as { full_name: string | null; email: string | null; phone: string | null } | null;

  // Generar QR de pago
  const paymentText = [
    `RESERVA: ${code}`,
    company.nequi_phone    ? `Nequi: ${company.nequi_phone}`       : "",
    company.daviplata_phone ? `Daviplata: ${company.daviplata_phone}` : "",
    reservation.total_value ? `Monto: $${reservation.total_value.toLocaleString("es-CO")} COP` : "",
    `Referencia: ${code}`,
  ].filter(Boolean).join("\n");

  const qrDataUrl = await QRCode.toDataURL(paymentText, { width: 120, margin: 1 });
  const qrBuffer  = Buffer.from(qrDataUrl.split(",")[1], "base64");

  // Logo de la empresa
  const logoPath = company.logo_filename
    ? path.join(process.cwd(), "public", "uploads", "logos", company.logo_filename)
    : null;

  // Generar PDF en memoria
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc   = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 595 - 100; // ancho útil
    const accentColor = "#10b981"; // emerald-500

    // ── Header ──────────────────────────────────────────────────────
    if (logoPath && fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { height: 50, fit: [150, 50] });
    }
    doc.fillColor(accentColor).fontSize(22).font("Helvetica-Bold")
       .text(company.name ?? "Agente DMC", logoPath ? 210 : 50, 45, { align: logoPath ? "left" : "right", width: W });
    doc.fillColor("#6b7280").fontSize(9).font("Helvetica")
       .text([company.phone, company.email].filter(Boolean).join("  ·  "), 50, 100, { align: "right", width: W });

    // ── Línea divisoria ──────────────────────────────────────────────
    doc.moveTo(50, 115).lineTo(545, 115).strokeColor(accentColor).lineWidth(2).stroke();

    // ── Título voucher ───────────────────────────────────────────────
    doc.fillColor("#111827").fontSize(18).font("Helvetica-Bold")
       .text("VOUCHER DE RESERVA", 50, 130, { align: "center", width: W });
    doc.fillColor(accentColor).fontSize(13).font("Helvetica-Bold")
       .text(code!, 50, 152, { align: "center", width: W });

    // ── QR de pago (esquina superior derecha) ────────────────────────
    doc.image(qrBuffer, 450, 130, { width: 90 });
    doc.fillColor("#9ca3af").fontSize(7).text("QR Pago", 450, 224, { width: 90, align: "center" });

    // ── Datos del cliente ────────────────────────────────────────────
    let y = 200;
    doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold").text("DATOS DEL CLIENTE", 50, y);
    y += 16;
    const clientFields: [string, string | null | undefined][] = [
      ["Nombre",   reservation.client_name ?? contact?.full_name],
      ["Correo",   contact?.email],
      ["Teléfono", contact?.phone],
    ];
    for (const [label, value] of clientFields) {
      if (!value) continue;
      doc.font("Helvetica-Bold").fillColor("#6b7280").fontSize(9).text(label + ": ", 50, y, { continued: true });
      doc.font("Helvetica").fillColor("#111827").text(value);
      y += 14;
    }

    // ── Detalles de la reserva ───────────────────────────────────────
    y += 10;
    doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold").text("DETALLES DEL SERVICIO", 50, y);
    y += 5;
    doc.moveTo(50, y + 11).lineTo(545, y + 11).strokeColor("#e5e7eb").lineWidth(1).stroke();
    y += 16;

    const serviceDate = new Date(reservation.service_date * 1000).toLocaleDateString("es-CO", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    const details: [string, string][] = [
      ["Servicio",   reservation.service_name ?? "—"],
      ["Fecha",      serviceDate],
      ["Personas",   String(reservation.people_count)],
      ["Estado",     reservation.status === "confirmed" ? "Confirmada ✓" : reservation.status],
    ];
    for (const [label, value] of details) {
      doc.rect(50, y - 2, W, 18).fillColor("#f9fafb").fill();
      doc.font("Helvetica-Bold").fillColor("#6b7280").fontSize(9).text(label + ":", 55, y, { width: 120 });
      doc.font("Helvetica").fillColor("#111827").text(value, 175, y, { width: W - 130 });
      y += 20;
    }

    // ── Total ────────────────────────────────────────────────────────
    if (reservation.total_value) {
      y += 5;
      doc.rect(50, y, W, 30).fillColor(accentColor).fill();
      doc.font("Helvetica-Bold").fillColor("white").fontSize(12)
         .text(`TOTAL PAGADO: $${reservation.total_value.toLocaleString("es-CO")} COP`, 55, y + 9, { width: W - 10 });
      y += 42;
    }

    // ── Notas ────────────────────────────────────────────────────────
    if (reservation.notes) {
      y += 5;
      doc.fillColor("#6b7280").fontSize(8).font("Helvetica-Oblique")
         .text("Notas: " + reservation.notes, 50, y, { width: W });
      y += 20;
    }

    // ── Footer ───────────────────────────────────────────────────────
    doc.moveTo(50, 730).lineTo(545, 730).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.fillColor("#9ca3af").fontSize(8).font("Helvetica")
       .text(`Generado el ${new Date().toLocaleDateString("es-CO")} · ${company.name ?? "Agente DMC"} · ${code}`, 50, 738, { align: "center", width: W });

    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="voucher-${code}.pdf"`,
    },
  });
}
