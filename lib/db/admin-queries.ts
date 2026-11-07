import { sql } from "drizzle-orm";
import { db } from "./index";
import { currentQuotaPeriod } from "./queries";

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
  name: string;
  email: string;
  role: "admin" | "user";
  suspended: number;
  plan: string;
  quotaTokens: number | null;
  quotaUsed: number;
  tokensTotal: number;
  lastActiveAt: number | null;
  createdAt: number;
  conversations: number;
};

export function listUsers({ q, page }: { q: string; page: number }) {
  const filter = q ? sql`WHERE u.email LIKE ${likePattern(q)} ESCAPE '\\' OR u.name LIKE ${likePattern(q)} ESCAPE '\\'` : sql``;
  const period = currentQuotaPeriod();
  const rows = db.all<AdminUserRow>(sql`
    SELECT u.id, u.name, u.email, u.role, u.suspended, u.plan,
           u.quota_tokens AS quotaTokens,
           CASE WHEN u.quota_period = ${period} THEN u.quota_used ELSE 0 END AS quotaUsed,
           u.tokens_total AS tokensTotal, u.last_active_at AS lastActiveAt, u.created_at AS createdAt,
           (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) AS conversations
    FROM users u ${filter}
    ORDER BY u.created_at DESC, u.id
    LIMIT ${PAGE_SIZE} OFFSET ${offset(page)}
  `);
  const total = db.get<{ count: number }>(sql`SELECT COUNT(*) AS count FROM users u ${filter}`)?.count ?? 0;
  return { rows, total };
}

export function overviewStats() {
  const dayAgo = Date.now() - DAY;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  return db.get<{
    users: number;
    admins: number;
    suspended: number;
    activeToday: number;
    conversations: number;
    tokensToday: number;
    tokensMonth: number;
    callsToday: number;
    rateLimitHits: number;
    flagged: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
      (SELECT COUNT(*) FROM users WHERE suspended = 1) AS suspended,
      (SELECT COUNT(*) FROM users WHERE last_active_at >= ${dayAgo}) AS activeToday,
      (SELECT COUNT(*) FROM conversations) AS conversations,
      (SELECT COALESCE(SUM(total_tokens), 0) FROM usage_events WHERE created_at >= ${dayAgo}) AS tokensToday,
      (SELECT COALESCE(SUM(total_tokens), 0) FROM usage_events WHERE created_at >= ${monthStart.getTime()}) AS tokensMonth,
      (SELECT COUNT(*) FROM usage_events WHERE created_at >= ${dayAgo}) AS callsToday,
      (SELECT COUNT(*) FROM rate_limit_events WHERE created_at >= ${dayAgo}) AS rateLimitHits,
      (SELECT COUNT(*) FROM messages WHERE flagged = 1) AS flagged
  `)!;
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
  }>(sql`
    SELECT e.user_id AS userId, u.email AS email, COUNT(*) AS calls,
           SUM(e.input_tokens) AS inputTokens, SUM(e.output_tokens) AS outputTokens,
           SUM(e.total_tokens) AS tokens
    FROM usage_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.created_at >= ${since}
    GROUP BY e.user_id ORDER BY tokens DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset(page)}
  `);
  const total =
    db.get<{ count: number }>(sql`
      SELECT COUNT(DISTINCT user_id) AS count FROM usage_events WHERE created_at >= ${since}
    `)?.count ?? 0;
  return { rows, total };
}

export function usageByModel(period: Period) {
  const { since } = periodWindow(period);
  return db.all<{
    model: string;
    agentId: string;
    calls: number;
    tokens: number;
    avgMs: number;
    errors: number;
    blocked: number;
  }>(sql`
    SELECT model, agent_id AS agentId, COUNT(*) AS calls, SUM(total_tokens) AS tokens,
           CAST(AVG(CASE WHEN status = 'ok' THEN duration_ms END) AS INTEGER) AS avgMs,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
           SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked
    FROM usage_events WHERE created_at >= ${since}
    GROUP BY model, agent_id ORDER BY calls DESC
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

export function searchConversations({ email, q, flagged, page }: { email: string; q: string; flagged: boolean; page: number }) {
  const conditions = [sql`1 = 1`];
  if (email) conditions.push(sql`u.email LIKE ${likePattern(email)} ESCAPE '\\'`);
  if (q) {
    conditions.push(sql`(c.title LIKE ${likePattern(q)} ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ${likePattern(q)} ESCAPE '\\'))`);
  }
  if (flagged) {
    conditions.push(sql`EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.flagged = 1)`);
  }
  const where = sql.join(conditions, sql` AND `);
  const rows = db.all<{
    id: string;
    title: string;
    model: string | null;
    email: string;
    updatedAt: number;
    messages: number;
    flagged: number;
  }>(sql`
    SELECT c.id, c.title, c.model, u.email, c.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messages,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.flagged = 1) AS flagged
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
