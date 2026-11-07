import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { authConfig } from "@/lib/auth.config";
import { findUserByEmail } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { credentialsSchema } from "@/lib/validators";

// Compared against when the email is unknown, so a miss costs as much as a hit.
const DUMMY_HASH =
  "$2b$12$.ym6CxekPDYGqLE5Uc22jO0USrCHEyuNmBqxEnMeorcDfOF4avEzm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
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
        const byIp = rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
        const byEmail = rateLimit(
          `login:email:${parsed.data.email}`,
          10,
          15 * 60 * 1000,
        );
        if (!byIp.ok || !byEmail.ok) return null;

        const user = findUserByEmail(parsed.data.email);
        const passwordMatches = await compare(
          parsed.data.password,
          user?.passwordHash ?? DUMMY_HASH,
        );
        if (!user || !passwordMatches) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
