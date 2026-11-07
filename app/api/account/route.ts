import { compare } from "bcryptjs";
import { auth } from "@/lib/auth";
import { deleteUser, findUserById } from "@/lib/db/queries";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Deletes the signed-in account and its conversations. Requires the current password. */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimit(`account:delete:${session.user.id}`, 5, 15 * 60 * 1000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const user = findUserById(session.user.id);
  if (
    !user ||
    typeof body?.password !== "string" ||
    !(await compare(body.password, user.passwordHash))
  ) {
    return Response.json({ error: "Password is incorrect." }, { status: 403 });
  }

  deleteUser(user.id);
  return new Response(null, { status: 204 });
}
