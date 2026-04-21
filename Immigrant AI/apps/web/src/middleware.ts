import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

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

    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  // Exclude api, next internals, admin-portal (handled above), and static files.
  matcher: ["/((?!api|_next|admin-portal|.*\\..*).*)"]
};
