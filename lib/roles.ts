export const ROLES = ["superadmin", "admin", "user"] as const;
export type Role = (typeof ROLES)[number];
export type StaffRole = Exclude<Role, "user">;

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Super Administrator",
  admin: "Administrator",
  user: "User",
};

/** Admins and super admins: may open the admin panel. */
export function isStaff(role: string | null | undefined): role is StaffRole {
  return role === "admin" || role === "superadmin";
}

export function asRole(value: unknown): Role {
  return (ROLES as readonly unknown[]).includes(value) ? (value as Role) : "user";
}
