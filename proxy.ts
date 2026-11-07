import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Uses the database-backed auth so the role is current on every request:
// promotions apply at once and suspended users are signed out here too.
export default auth((req) => {
  const isLoggedIn = Boolean(req.auth?.user?.id);
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isProtected = pathname.startsWith("/chat") || isAdminPage;

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminPage && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/chat", req.nextUrl));
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/chat", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/chat/:path*", "/admin/:path*", "/admin", "/login", "/register"],
};
