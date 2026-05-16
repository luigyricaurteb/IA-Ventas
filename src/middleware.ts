import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("session_token")?.value;

  const isLoginPage   = pathname === "/login";
  const isAuthApi     = pathname.startsWith("/api/auth");
  const isPublicAsset = pathname.startsWith("/uploads") || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  const isPublicApi   = pathname.startsWith("/api/public");

  if (isPublicAsset || isAuthApi || isPublicApi) return NextResponse.next();

  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
