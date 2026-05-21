import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("session_token")?.value;

  const isLoginPage   = pathname === "/login";
  const isLandingPage = pathname === "/";
  const isAuthApi     = pathname.startsWith("/api/auth");
  const isPublicAsset = pathname.startsWith("/uploads") || pathname.startsWith("/_next") || pathname === "/favicon.ico"
    || pathname.endsWith(".html") || pathname.endsWith(".pdf") || pathname.endsWith(".webmanifest");
  const isPublicApi   = pathname.startsWith("/api/public");
  const isWebhook     = pathname.startsWith("/api/whatsapp/webhook");
  const isPublicPdf   = pathname.startsWith("/api/pdf/public");
  const isAutopilotImg = pathname.startsWith("/api/uploads/autopilot");
  const isResetPage    = pathname.startsWith("/reset-password");
  const isRegisterPage = pathname.startsWith("/register");

  if (isPublicAsset || isAuthApi || isPublicApi || isWebhook || isPublicPdf || isResetPage || isRegisterPage || isAutopilotImg || isLandingPage) return NextResponse.next();

  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
