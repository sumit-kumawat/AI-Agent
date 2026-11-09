import { compare } from "bcryptjs";
import { pruneUserFiles } from "@/lib/attachments/store";
import { auth } from "@/lib/auth";
import { adminCount, deleteUser, findUserById, superAdminCount } from "@/lib/db/queries";
import { removeUserWorkspaces } from "@/lib/ide/workspaces";
import { isStaff } from "@/lib/roles";
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
  if (user.role === "superadmin" && superAdminCount() <= 1) {
    return Response.json(
      { error: "You are the only Super Administrator. Make someone else one before deleting this account." },
      { status: 409 },
    );
  }
  if (isStaff(user.role) && adminCount() <= 1) {
    return Response.json(
      { error: "You are the only admin. Make someone else an admin before deleting this account." },
      { status: 409 },
    );
  }

  removeUserWorkspaces(user.id);
  deleteUser(user.id);
  pruneUserFiles(user.id);
  return new Response(null, { status: 204 });
}
