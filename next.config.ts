import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@whiskeysockets/baileys", "better-sqlite3", "pino", "pdfkit"],
  // Headers anti-caché para forzar actualización en browsers
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Build", value: new Date().toISOString().slice(0,10) },
        ],
      },
    ];
  },
};

export default nextConfig;
