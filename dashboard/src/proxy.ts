import { type NextRequest, NextResponse } from "next/server";

// Optimistic check only (cookie present). Real session validation happens in requireUser().
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("studio_session");
  const isLogin = req.nextUrl.pathname === "/login";

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
