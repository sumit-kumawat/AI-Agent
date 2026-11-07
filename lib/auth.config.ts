import type { NextAuthConfig } from "next-auth";

// Edge-safe settings shared with proxy.ts. It reads the role from the token
// without touching the database; lib/auth.ts re-validates it on the server.
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.role = user.role ?? "user";
        token.sv = user.sessionVersion ?? 0;
        token.fl = user.firstLogin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.id === "string" ? token.id : (token.sub ?? "");
        session.user.role = token.role === "admin" ? "admin" : "user";
        session.user.mustChangePassword = token.fl === true;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
