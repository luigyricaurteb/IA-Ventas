import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aivox — Automatiza tu negocio con IA y WhatsApp",
  description: "Aivox es la plataforma SaaS que automatiza WhatsApp con inteligencia artificial para PYMES latinoamericanas. CRM, reservas, contabilidad y más — todo desde WhatsApp.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Aivox" },
  keywords: ["WhatsApp Business", "automatización WhatsApp", "chatbot WhatsApp", "CRM WhatsApp", "IA para negocios", "automatización PYMES", "WhatsApp IA Colombia", "Aivox"],
  authors: [{ name: "Aivox Group" }],
  creator: "Aivox Group",
  publisher: "Aivox Group",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    type: "website",
    locale: "es_CO",
    url: "https://aivoxgroup.com",
    siteName: "Aivox",
    title: "Aivox — Automatiza tu negocio con IA y WhatsApp",
    description: "La plataforma que convierte WhatsApp en tu mejor vendedor. Julieta, tu IA, responde 24/7, gestiona reservas y cierra ventas automáticamente.",
    images: [{ url: "https://aivoxgroup.com/og-image.png", width: 1200, height: 630, alt: "Aivox Platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aivox — Automatiza tu negocio con IA y WhatsApp",
    description: "La plataforma SaaS que automatiza WhatsApp con IA para PYMES latinoamericanas.",
  },
  alternates: { canonical: "https://aivoxgroup.com" },
};

export const viewport: Viewport = {
  themeColor: "#1e1b4b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Aivox",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "url": "https://aivoxgroup.com",
              "description": "Plataforma SaaS de automatización WhatsApp con IA para PYMES latinoamericanas",
              "offers": { "@type": "AggregateOffer", "priceCurrency": "COP", "lowPrice": "0" },
              "provider": { "@type": "Organization", "name": "Aivox Group", "url": "https://aivoxgroup.com" },
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
