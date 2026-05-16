import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente WhatsApp",
  description: "Dashboard de agente WhatsApp con IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
