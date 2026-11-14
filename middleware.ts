import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Coarse session gate for the admin surface (ADR-3D.3 A4). It only checks that
 * a session cookie EXISTS; the authoritative checks (token signature, expiry,
 * user mapping, permissions) happen server-side in the layout and in every
 * server action/service. Public routes are never matched here.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (!request.cookies.get("setda_session")) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
