import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";

  const isAdminSubdomain =
    host === "admin.immigrant.guru" || host.startsWith("admin.immigrant.guru:");

  if (isAdminSubdomain) {
    const { pathname } = request.nextUrl;

    if (pathname === "/" || pathname === "") {
      return NextResponse.rewrite(new URL("/admin-portal", request.url));
    }

    if (
      !pathname.startsWith("/admin-portal") &&
      !pathname.startsWith("/_next") &&
      !pathname.startsWith("/api")
    ) {
      return NextResponse.rewrite(
        new URL(`/admin-portal${pathname}`, request.url)
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"]
};
