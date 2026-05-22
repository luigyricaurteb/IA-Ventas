import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Validates JWT signature and expiry using Web Crypto (Edge-compatible, no Node.js crypto)
async function isValidToken(token: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET ?? "";
  if (!secret || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, body, sigB64] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false, ["verify"]
    );

    // Decode base64url → Uint8Array
    const pad = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/");
    const sig = Uint8Array.from(atob(pad(sigB64)), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(`${header}.${body}`));
    if (!valid) return false;

    // Check expiry
    const payload = JSON.parse(atob(pad(body))) as { exp?: number };
    return typeof payload.exp !== "number" || payload.exp >= Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isLoginPage    = pathname === "/login";
  const isLandingPage  = pathname === "/";
  const isApiRoute     = pathname.startsWith("/api/");
  const isPublicAsset  = pathname.startsWith("/uploads") || pathname.startsWith("/_next")
    || pathname === "/favicon.ico" || pathname.endsWith(".html")
    || pathname.endsWith(".pdf") || pathname.endsWith(".webmanifest");
  const isAuthApi      = pathname.startsWith("/api/auth");
  const isPublicApi    = pathname.startsWith("/api/public");
  const isWebhook      = pathname.startsWith("/api/whatsapp/webhook");
  const isPublicPdf    = pathname.startsWith("/api/pdf/public");
  const isAutopilotImg = pathname.startsWith("/api/uploads/autopilot");
  const isResetPage    = pathname.startsWith("/reset-password");
  const isRegisterPage = pathname.startsWith("/register");
  const isPaymentApi   = pathname.startsWith("/api/public/payment");

  // Always allow public paths (no token needed)
  if (isPublicAsset || isAuthApi || isPublicApi || isWebhook || isPublicPdf
      || isResetPage || isRegisterPage || isAutopilotImg || isLandingPage || isPaymentApi) {
    return NextResponse.next();
  }

  // API routes validate their own tokens in route handlers — don't redirect, let them 401
  if (isApiRoute) return NextResponse.next();

  const token = request.cookies.get("session_token")?.value;

  if (!token) {
    if (!isLoginPage) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  // Validate JWT signature + expiry for all page routes
  const valid = await isValidToken(token);

  if (!valid) {
    // Clear the invalid/expired cookie and send to login
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("session_token");
    return res;
  }

  if (isLoginPage) return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
