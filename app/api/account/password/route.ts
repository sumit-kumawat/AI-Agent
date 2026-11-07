import { compare, hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { findUserById } from "@/lib/db/queries";
import { users } from "@/lib/db/schema";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Changes the signed-in user's password and clears the first-login flag.
 * Every existing session is signed out; the client signs in again with the
 * new password.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimit(`account:password:${session.user.id}`, 5, 15 * 60 * 1000, {
    endpoint: "change-password",
    userId: session.user.id,
    ip: clientIp(request.headers),
  });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form and try again." },
      { status: 400 },
    );
  }

  const user = findUserById(session.user.id);
  if (!user || !(await compare(parsed.data.currentPassword, user.passwordHash))) {
    return Response.json({ error: "Current password is incorrect." }, { status: 403 });
  }

  db.update(users)
    .set({
      passwordHash: await hash(parsed.data.newPassword, 12),
      firstLogin: false,
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, user.id))
    .run();
  audit(user, "account.password_change", { type: "user", id: user.id }, { firstLogin: user.firstLogin });

  return Response.json({ ok: true, email: user.email });
}
