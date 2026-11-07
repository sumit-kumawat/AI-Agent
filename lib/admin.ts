import { firstUserId } from "@/lib/db/queries";
import { env } from "@/lib/env";

/** Admins can download and remove models. Without ADMIN_EMAILS, the first account is the admin. */
export function isAdmin(user: { id: string; email?: string | null }) {
  if (env.ADMIN_EMAILS.length > 0) {
    return Boolean(user.email && env.ADMIN_EMAILS.includes(user.email.toLowerCase()));
  }
  return firstUserId() === user.id;
}
