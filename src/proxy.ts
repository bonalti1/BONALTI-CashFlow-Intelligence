import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: it looks for a session cookie and never touches the database.
// Every page, Server Action and Route Handler verifies the session itself.
const sessionCookieName = "stb_session";

const publicPages = ["/login", "/setup-owner", "/api/health"];
const publicPagePrefixes = ["/invite/"];
// These routes check their own bearer token.
const tokenApiPrefixes = ["/api/readonly/", "/api/ai-csuite/finance-export"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    publicPages.includes(pathname) ||
    publicPagePrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    tokenApiPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(sessionCookieName)?.value);

  if (pathname.startsWith("/api/")) {
    if (hasSessionCookie || request.headers.has("authorization")) {
      return NextResponse.next();
    }

    return NextResponse.json({ message: "Sign in to continue." }, { status: 401 });
  }

  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);

  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)",
  ],
};
