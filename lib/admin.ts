import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findUserById } from "@/lib/db/queries";
import { isStaff, type StaffRole } from "@/lib/roles";

export type AdminUser = { id: string; email: string; name: string; role: StaffRole };

type AdminCheck = { admin: AdminUser } | { admin: null; mustChangePassword: boolean };

/** The signed-in user if the database says they are an active admin with a password of their own. */
async function currentAdmin(): Promise<AdminCheck> {
  const session = await auth();
  if (!session?.user?.id) return { admin: null, mustChangePassword: false };
  const user = findUserById(session.user.id);
  if (!user || !isStaff(user.role) || user.suspended) return { admin: null, mustChangePassword: false };
  if (user.firstLogin) return { admin: null, mustChangePassword: true };
  return { admin: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

/** For admin pages: sends non-admins away, and admins still on a seeded or temporary password to change it. */
export async function requireAdmin() {
  const check = await currentAdmin();
  if (!check.admin) redirect(check.mustChangePassword ? "/account/password?next=/admin" : "/chat");
  return check.admin;
}

/** For pages only a super admin may open, such as security settings. */
export async function requireSuperAdmin() {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") redirect("/admin");
  return admin;
}

/** For server actions and admin API routes: throws for non-admins. */
export async function adminAction() {
  const check = await currentAdmin();
  if (!check.admin) {
    throw new Error(check.mustChangePassword ? "Change your password before using the admin panel." : "Only admins can do that.");
  }
  return check.admin;
}

/** For actions that change admin accounts or security settings. */
export async function superAdminAction() {
  const admin = await adminAction();
  if (admin.role !== "superadmin") throw new Error("Only a Super Administrator can do that.");
  return admin;
}

/** Admins may manage regular users; only a super admin may act on another admin. */
export function assertCanManage(admin: AdminUser, target: { role: string }) {
  if (isStaff(target.role) && admin.role !== "superadmin") {
    throw new Error("Only a Super Administrator can change administrator accounts.");
  }
}

export function isAdmin(user: { id: string }) {
  const record = findUserById(user.id);
  return Boolean(record && isStaff(record.role) && !record.suspended && !record.firstLogin);
}
