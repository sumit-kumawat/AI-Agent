import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";

export type AdminUser = { id: string; email: string; name: string };

/** The signed-in user if the database says they are an active admin. */
async function currentAdmin(): Promise<AdminUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = findUserById(session.user.id);
  if (!user || user.role !== "admin" || user.suspended) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** For admin pages: sends non-admins away. */
export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/chat");
  return admin;
}

/** For server actions and admin API routes: throws for non-admins. */
export async function adminAction() {
  const admin = await currentAdmin();
  if (!admin) throw new Error("Only admins can do that.");
  return admin;
}

export function isAdmin(user: { id: string }) {
  const record = findUserById(user.id);
  return Boolean(record && record.role === "admin" && !record.suspended);
}
