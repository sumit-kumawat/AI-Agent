import { sql } from "drizzle-orm";
import { db } from "./index";
import type { Role } from "@/lib/roles";

export const PAGE_SIZE = 20;

export type Period = "daily" | "weekly" | "monthly";

const DAY = 24 * 60 * 60 * 1000;

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function offset(page: number) {
  return (Math.max(1, page) - 1) * PAGE_SIZE;
}

export function periodWindow(period: Period) {
  if (period === "daily") return { since: Date.now() - 30 * DAY, format: "%Y-%m-%d", label: "Last 30 days" };
  if (period === "weekly") return { since: Date.now() - 12 * 7 * DAY, format: "%Y-W%W", label: "Last 12 weeks" };
  return { since: Date.now() - 365 * DAY, format: "%Y-%m", label: "Last 12 months" };
}

export type AdminUserRow = {
  id: string;
  publicId: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  suspended: number;
  plan: string;
  tokensTotal: number;
  lastActiveAt: number | null;
  createdAt: number;
  conversations: number;
};

export const USER_STATUSES = ["all", "active", "suspended", "staff", "inactive"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export function listUsers({ q, page, status = "all", plan = "" }: { q: string; page: number; status?: UserStatus; plan?: string }) {
  const like = likePattern(q);
  const conditions = [sql`1 = 1`];
  if (q) {
    conditions.push(
      sql`(u.email LIKE ${like} ESCAPE '\\' OR u.name LIKE ${like} ESCAPE '\\' OR u.username LIKE ${like} ESCAPE '\\' OR u.public_id LIKE ${like} ESCAPE '\\')`,
    );
  }
  if (status === "active") conditions.push(sql`u.suspended = 0 AND u.last_active_at >= ${Date.now() - 30 * DAY}`);
  if (status === "inactive") conditions.push(sql`u.suspended = 0 AND (u.last_active_at IS NULL OR u.last_active_at < ${Date.now() - 30 * DAY})`);
  if (status === "suspended") conditions.push(sql`u.suspended = 1`);
  if (status === "staff") conditions.push(sql`u.role IN ('admin', 'superadmin')`);
  if (plan) conditions.push(sql`u.plan = ${plan}`);
  const filter = sql`WHERE ${sql.join(conditions, sql` AND `)}`;
  const rows = db.all<AdminUserRow>(sql`
    SELECT u.id, u.public_id AS publicId, u.username, u.name, u.email, u.role, u.suspended, u.plan,
           u.tokens_total AS tokensTotal, u.last_active_at AS lastActiveAt, u.created_at AS createdAt,
           (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) AS conversations
    FROM users u ${filter}
    ORDER BY u.created_at DESC, u.id
    LIMIT ${PAGE_SIZE} OFFSET ${offset(page)}
  `);
  const total = db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM users u ${filter}`)?.count ?? 0;
  return { rows, total };
}

export function usageTimeline(period: Period) {
  const { since, format } = periodWindow(period);
  return db.all<{ bucket: string; tokens: number; calls: number }>(sql`
    SELECT strftime(${format}, created_at / 1000, 'unixepoch') AS bucket,
           SUM(total_tokens) AS tokens, COUNT(*) AS calls
    FROM usage_events WHERE created_at >= ${since}
    GROUP BY bucket ORDER BY bucket
  `);
}

export function usageByUser(period: Period, page: number) {
  const { since } = periodWindow(period);
  const rows = db.all<{
    userId: string;
    email: string | null;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    tokens: number;
    accounts: number;
  }>(sql`
    SELECT CASE WHEN u.id IS NULL THEN '' ELSE e.user_id END AS userId, u.email AS email, COUNT(*) AS calls,
           SUM(e.input_tokens) AS inputTokens, SUM(e.output_tokens) AS outputTokens,
           SUM(e.total_tokens) AS tokens, COUNT(DISTINCT e.user_id) AS accounts
    FROM usage_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.created_at >= ${since}
    GROUP BY CASE WHEN u.id IS NULL THEN '' ELSE e.user_id END ORDER BY tokens DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset(page)}
  `);
  const counts = db.get<{ groups: number; active: number; deleted: number }>(sql`
    SELECT COUNT(DISTINCT CASE WHEN u.id IS NULL THEN '' ELSE e.user_id END) AS groups,
           COUNT(DISTINCT u.id) AS active,
           COUNT(DISTINCT CASE WHEN u.id IS NULL THEN e.user_id END) AS deleted
    FROM usage_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.created_at >= ${since}
  `) ?? { groups: 0, active: 0, deleted: 0 };
  return { rows, total: counts.groups, activeAccounts: counts.active, deletedAccounts: counts.deleted };
}

export function usageByModel(period: Period) {
  const { since } = periodWindow(period);
  return db.all<{
    model: string;
    agentId: string;
    providerId: string | null;
    calls: number;
    tokens: number;
    costMicro: number | null;
    avgMs: number;
    errors: number;
    blocked: number;
  }>(sql`
    SELECT model, agent_id AS agentId, provider_id AS providerId, COUNT(*) AS calls,
           SUM(total_tokens) AS tokens, SUM(cost_micro) AS costMicro,
           CAST(AVG(CASE WHEN status = 'ok' THEN duration_ms END) AS INTEGER) AS avgMs,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
           SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked
    FROM usage_events WHERE created_at >= ${since}
    GROUP BY model, agent_id, provider_id ORDER BY calls DESC
  `);
}

export function rateLimitLog(page: number) {
  const rows = db.all<{
    id: number;
    email: string | null;
    userId: string | null;
    ip: string | null;
    endpoint: string;
    limitKey: string;
    createdAt: number;
  }>(sql`
    SELECT r.id, u.email AS email, r.user_id AS userId, r.ip, r.endpoint,
           r.limit_key AS limitKey, r.created_at AS createdAt
    FROM rate_limit_events r LEFT JOIN users u ON u.id = r.user_id
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset(page)}
  `);
  const total = db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM rate_limit_events`)?.count ?? 0;
  return { rows, total };
}

export function auditLog({ page, q }: { page: number; q: string }) {
  const filter = q
    ? sql`WHERE action LIKE ${likePattern(q)} ESCAPE '\\' OR admin_email LIKE ${likePattern(q)} ESCAPE '\\' OR target_id LIKE ${likePattern(q)} ESCAPE '\\'`
    : sql``;
  const rows = db.all<{
    id: number;
    adminEmail: string;
    action: string;
    targetType: string;
    targetId: string | null;
    details: string | null;
    createdAt: number;
  }>(sql`
    SELECT id, admin_email AS adminEmail, action, target_type AS targetType,
           target_id AS targetId, details, created_at AS createdAt
    FROM admin_audit_log ${filter}
    ORDER BY created_at DESC, id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset(page)}
  `);
  const total = db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM admin_audit_log ${filter}`)?.count ?? 0;
  return { rows, total };
}

export function searchConversations({
  email,
  q,
  flagged,
  page,
  inactiveDays = 0,
  withFiles = false,
}: {
  email: string;
  q: string;
  flagged: boolean;
  page: number;
  inactiveDays?: number;
  withFiles?: boolean;
}) {
  const conditions = [sql`1 = 1`];
  if (email) conditions.push(sql`u.email LIKE ${likePattern(email)} ESCAPE '\\'`);
  if (inactiveDays > 0) conditions.push(sql`c.updated_at < ${Date.now() - inactiveDays * DAY}`);
  if (withFiles) conditions.push(sql`EXISTS (SELECT 1 FROM attachments a WHERE a.conversation_id = c.id)`);
  // Titles only: searching message text would expose content without a recorded reason.
  if (q) conditions.push(sql`c.title LIKE ${likePattern(q)} ESCAPE '\\'`);
  if (flagged) {
    conditions.push(sql`EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.flagged = 1)`);
  }
  const where = sql.join(conditions, sql` AND `);
  const rows = db.all<{
    id: string;
    title: string;
    model: string | null;
    email: string;
    userId: string;
    updatedAt: number;
    pinned: number;
    temporary: number;
    messages: number;
    flagged: number;
    attachments: number;
    attachmentBytes: number;
  }>(sql`
    SELECT c.id, c.title, c.model, u.email, u.id AS userId, c.updated_at AS updatedAt,
           c.pinned_at IS NOT NULL AS pinned, c.temporary,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messages,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.flagged = 1) AS flagged,
           (SELECT COUNT(*) FROM attachments a WHERE a.conversation_id = c.id) AS attachments,
           (SELECT COALESCE(SUM(size), 0) FROM attachments a WHERE a.conversation_id = c.id) AS attachmentBytes
    FROM conversations c JOIN users u ON u.id = c.user_id
    WHERE ${where}
    ORDER BY c.updated_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset(page)}
  `);
  const total =
    db.get<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM conversations c JOIN users u ON u.id = c.user_id WHERE ${where}
    `)?.count ?? 0;
  return { rows, total };
}

export function conversationForAudit(id: string) {
  const conversation = db.get<{
    id: string;
    title: string;
    model: string | null;
    createdAt: number;
    updatedAt: number;
    userId: string;
    email: string;
    name: string;
  }>(sql`
    SELECT c.id, c.title, c.model, c.created_at AS createdAt, c.updated_at AS updatedAt,
           u.id AS userId, u.email, u.name
    FROM conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ${id}
  `);
  if (!conversation) return null;
  const messages = db.all<{
    id: string;
    role: "user" | "assistant";
    content: string;
    flagged: number;
    flagReason: string | null;
    flaggedBy: string | null;
    flaggedAt: number | null;
    createdAt: number;
  }>(sql`
    SELECT id, role, content, flagged, flag_reason AS flagReason, flagged_by AS flaggedBy,
           flagged_at AS flaggedAt, created_at AS createdAt
    FROM messages WHERE conversation_id = ${id} ORDER BY created_at, id
  `);
  return { conversation, messages };
}
