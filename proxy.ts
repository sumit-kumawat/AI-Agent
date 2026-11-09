import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const CHANGE_PASSWORD = "/account/password";

// Uses the database-backed auth so the role is current on every request:
// promotions apply at once and suspended users are signed out here too.
export default auth((req) => {
  const user = req.auth?.user;
  const isLoggedIn = Boolean(user?.id);
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isAdminPage =
    pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/ide" || pathname.startsWith("/ide/");
  const isAccountPage = pathname === "/account" || pathname.startsWith("/account/");
  const isProtected = pathname.startsWith("/chat") || isAdminPage || isAccountPage;

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && user?.mustChangePassword && pathname !== CHANGE_PASSWORD && (isProtected || isAuthPage)) {
    const url = new URL(CHANGE_PASSWORD, req.nextUrl);
    if (isAdminPage) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminPage && user?.role !== "admin") {
    return NextResponse.redirect(new URL("/chat", req.nextUrl));
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/chat", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/chat/:path*", "/admin/:path*", "/admin", "/ide", "/ide/:path*", "/account/:path*", "/login", "/register"],
};
