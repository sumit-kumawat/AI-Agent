import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { authConfig } from "@/lib/auth.config";
import { findUserById, findUserByLogin, touchUser } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { credentialsSchema } from "@/lib/validators";

// Compared against when the email is unknown, so a miss costs as much as a hit.
const DUMMY_HASH =
  "$2b$12$.ym6CxekPDYGqLE5Uc22jO0USrCHEyuNmBqxEnMeorcDfOF4avEzm";

const WINDOW = 15 * 60 * 1000;

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

class Suspended extends CredentialsSignin {
  code = "suspended";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  callbacks: {
    ...authConfig.callbacks,
    // Runs on every server-side auth() call. Role changes apply immediately, and
    // suspension or a password reset (session_version bump) ends existing sessions.
    jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      if (params.user || typeof token.id !== "string") return token;
      const user = findUserById(token.id);
      if (!user || user.suspended || user.sessionVersion !== (token.sv ?? 0)) {
        return null;
      }
      token.role = user.role;
      token.fl = user.firstLogin;
      return token;
    },
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const parsed = credentialsSchema.safeParse({
          email:
            typeof credentials?.email === "string"
              ? credentials.email.trim().toLowerCase()
              : credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.success) return null;

        const ip = clientIp(request.headers);
        const context = { endpoint: "sign-in", ip };
        const byIp = ip ? rateLimit(`login:ip:${ip}`, 30, WINDOW, context) : { ok: true };
        const byEmail = rateLimit(`login:email:${parsed.data.email}`, 10, WINDOW, context);
        if (!byIp.ok || !byEmail.ok) throw new RateLimited();

        const user = findUserByLogin(parsed.data.email, env.ADMIN_EMAIL);
        const passwordMatches = await compare(
          parsed.data.password,
          user?.passwordHash ?? DUMMY_HASH,
        );
        if (!user || !passwordMatches) return null;
        if (user.suspended) throw new Suspended();

        touchUser(user.id);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
          firstLogin: user.firstLogin,
        };
      },
    }),
  ],
});
