import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";

/** How long one justified request lets an admin read a conversation. */
export const ACCESS_WINDOW_MS = 30 * 60 * 1000;
export const ACCESS_ACTION = "conversation.content_access";

/**
 * Admins cannot read conversation content by default. Each access needs a
 * written reason, which is recorded in the audit log; that entry is the grant.
 */
export function activeContentGrant(adminId: string, conversationId: string) {
  return db
    .select({ createdAt: adminAuditLog.createdAt, details: adminAuditLog.details })
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.adminId, adminId),
        eq(adminAuditLog.action, ACCESS_ACTION),
        eq(adminAuditLog.targetId, conversationId),
        gt(adminAuditLog.createdAt, Date.now() - ACCESS_WINDOW_MS),
      ),
    )
    .orderBy(desc(adminAuditLog.createdAt))
    .get();
}
