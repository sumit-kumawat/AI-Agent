import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth?.user?.id);
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isProtected = pathname.startsWith("/chat");

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/chat", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/chat/:path*", "/login", "/register"],
};
