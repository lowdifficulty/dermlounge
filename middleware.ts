import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * trailingSlash is on for the mirrored marketing pages, but Meta (and other
 * webhook senders) POST to the no-slash URL and do not follow 308s with a body.
 * Rewrite API paths in place; redirect only document URLs.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/" || pathname.endsWith("/")) {
    return NextResponse.next();
  }
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const slashed = new URL(request.url);
  slashed.pathname = `${pathname}/`;
  if (pathname.startsWith("/api/")) {
    return NextResponse.rewrite(slashed);
  }
  return NextResponse.redirect(slashed, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
