import nodemailer from "nodemailer";
import { getSmtpConfig } from "./db";

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const config = getSmtpConfig();
  if (!config.host || !config.user) {
    throw new Error("SMTP no configurado. Configúralo en Ajustes → SMTP.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure === 1,
    auth: { user: config.user, pass: config.password ?? "" },
  });

  const fromName = config.from_name ?? config.user;
  const fromEmail = config.from_email ?? config.user;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

export function renderTemplate(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}
