import { type NextRequest, NextResponse } from "next/server";

// Optimistic check only (cookie present). Real session validation happens in requireUser().
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("studio_session");
  const isLogin = req.nextUrl.pathname === "/login";
  // Called by n8n with a shared secret, checked in the route.
  const isAutomation = req.nextUrl.pathname.startsWith("/api/automations/");
  // Client feedback pages are protected by the secret token in the URL.
  const isClientLink = req.nextUrl.pathname.startsWith("/c/");

  if (!hasSession && !isLogin && !isAutomation && !isClientLink) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
