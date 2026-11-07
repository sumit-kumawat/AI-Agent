import { db } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";

export function audit(
  admin: { id: string; email: string },
  action: string,
  target: { type: string; id?: string | null },
  details?: Record<string, unknown>,
) {
  db.insert(adminAuditLog)
    .values({
      adminId: admin.id,
      adminEmail: admin.email,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      details: details ? JSON.stringify(details) : null,
      createdAt: Date.now(),
    })
    .run();
}
