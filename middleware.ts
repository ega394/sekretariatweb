import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Coarse session gate for the admin surface (fine-grained RBAC is enforced in
 * services/server actions — defense in depth, ADR-3D.3 A4). Public routes are
 * never matched here, so they stay anonymous and cacheable.
 *
 * Slice-1 has no admin UI yet; this establishes the boundary for /admin/*.
 */
export function middleware(_request: NextRequest) {
  // TODO(3D.x): resolve Supabase session; redirect anonymous → /admin/login.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
