import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { pruneUserFiles, uploadsRoot } from "@/lib/attachments/store";
import { db } from "@/lib/db";
import { deleteUser } from "@/lib/db/queries";
import { attachments, conversations, memories } from "@/lib/db/schema";
import { workspacesRoot } from "@/lib/ide/paths";
import { folderBytes, removeUserWorkspaces } from "@/lib/ide/workspaces";

export const CLEANUP_PARTS = ["conversations", "attachments", "workspaces", "memories", "account"] as const;
export type CleanupPart = (typeof CLEANUP_PARTS)[number];

export type UserDataSummary = {
  id: string;
  email: string;
  role: string;
  conversations: number;
  messages: number;
  attachments: number;
  attachmentBytes: number;
  workspaces: number;
  workspaceBytes: number;
  memories: number;
  /** Kept whatever is deleted: billing-relevant usage and the audit trail. */
  usageEvents: number;
  auditEntries: number;
};

/** Recent metered requests, admin actions on or by the account, and sign-in problems. */
export function userActivity(id: string, email: string, limit = 25) {
  const usage = db.all<{ id: number; createdAt: number; feature: string; model: string; status: string; totalTokens: number; durationMs: number; estimated: number }>(sql`
    SELECT id, created_at AS createdAt, feature, model, status, total_tokens AS totalTokens, duration_ms AS durationMs, estimated
    FROM usage_events WHERE user_id = ${id} ORDER BY created_at DESC LIMIT ${limit}
  `);
  const audit = db.all<{ id: number; createdAt: number; adminEmail: string; action: string; targetId: string | null; details: string | null }>(sql`
    SELECT id, created_at AS createdAt, admin_email AS adminEmail, action, target_id AS targetId, details
    FROM admin_audit_log WHERE target_id = ${id} OR admin_id = ${id} ORDER BY created_at DESC LIMIT ${limit}
  `);
  const security = db.all<{ id: number; createdAt: number; type: string; ip: string | null }>(sql`
    SELECT id, created_at AS createdAt, type, ip FROM security_events
    WHERE user_id = ${id} OR email = ${email.toLowerCase()} ORDER BY created_at DESC LIMIT ${limit}
  `);
  return { usage, audit, security };
}

/** What a user has stored, as counted in the database and on disk. */
export function userDataSummary(id: string): UserDataSummary | null {
  const row = db.get<Omit<UserDataSummary, "workspaceBytes">>(sql`
    SELECT u.id, u.email, u.role,
      (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) AS conversations,
      (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = u.id) AS messages,
      (SELECT COUNT(*) FROM attachments WHERE user_id = u.id) AS attachments,
      (SELECT COALESCE(SUM(size), 0) FROM attachments WHERE user_id = u.id) AS attachmentBytes,
      (SELECT COUNT(*) FROM workspaces WHERE created_by = u.id) AS workspaces,
      (SELECT COUNT(*) FROM memories WHERE user_id = u.id) AS memories,
      (SELECT COUNT(*) FROM usage_events WHERE user_id = u.id) AS usageEvents,
      (SELECT COUNT(*) FROM admin_audit_log WHERE target_id = u.id OR admin_id = u.id) AS auditEntries
    FROM users u WHERE u.id = ${id}
  `);
  if (!row) return null;
  const folders = db.all<{ folder: string }>(sql`SELECT folder FROM workspaces WHERE created_by = ${id}`);
  const workspaceBytes = folders.reduce((sum, { folder }) => sum + folderBytes(path.join(workspacesRoot, folder)), 0);
  return { ...row, workspaceBytes };
}

/**
 * Deletes the chosen parts of a user's data. `account` removes the account
 * and everything it owns. Usage events and the audit log are always kept.
 * Safe to repeat: parts already gone count as zero.
 */
export function cleanupUserData(id: string, parts: Set<CleanupPart>) {
  const before = userDataSummary(id);
  if (!before) return null;
  const removed = { conversations: 0, messages: 0, attachments: 0, workspaces: 0, memories: 0, account: false };
  if (parts.has("account")) {
    removed.workspaces = removeUserWorkspaces(id);
    deleteUser(id);
    fs.rmSync(path.join(uploadsRoot, id), { recursive: true, force: true });
    return {
      before,
      removed: { ...removed, conversations: before.conversations, messages: before.messages, attachments: before.attachments, memories: before.memories, account: true },
    };
  }
  if (parts.has("conversations")) {
    removed.messages = before.messages;
    removed.conversations = db.delete(conversations).where(eq(conversations.userId, id)).run().changes;
  }
  if (parts.has("attachments")) {
    removed.attachments = db.delete(attachments).where(eq(attachments.userId, id)).run().changes;
  }
  if (parts.has("conversations") || parts.has("attachments")) pruneUserFiles(id);
  if (parts.has("workspaces")) removed.workspaces = removeUserWorkspaces(id);
  if (parts.has("memories")) removed.memories = db.delete(memories).where(eq(memories.userId, id)).run().changes;
  return { before, removed };
}
