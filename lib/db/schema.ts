import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Tables are created and upgraded by ./migrate.ts on startup. Keep the two in sync.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  plan: text("plan").notNull().default("free"),
  /** Monthly token allowance; null means unlimited. */
  quotaTokens: integer("quota_tokens"),
  quotaUsed: integer("quota_used").notNull().default(0),
  /** The month (YYYY-MM) quotaUsed belongs to. */
  quotaPeriod: text("quota_period"),
  tokensTotal: integer("tokens_total").notNull().default(0),
  lastActiveAt: integer("last_active_at"),
  /** Bumped to sign the user out everywhere (password reset, suspension). */
  sessionVersion: integer("session_version").notNull().default(0),
  /** Must choose a new password before using the app. */
  firstLogin: integer("first_login", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    model: text("model"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("conversations_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
    flagReason: text("flag_reason"),
    flaggedBy: text("flagged_by"),
    flaggedAt: integer("flagged_at"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const usageEvents = sqliteTable("usage_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  agentId: text("agent_id").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  status: text("status", { enum: ["ok", "aborted", "error", "blocked"] }).notNull(),
  createdAt: integer("created_at").notNull(),
});

export const rateLimitEvents = sqliteTable("rate_limit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  ip: text("ip"),
  endpoint: text("endpoint").notNull(),
  limitKey: text("limit_key").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: text("admin_id").notNull(),
  adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  details: text("details"),
  createdAt: integer("created_at").notNull(),
});

export const agentConfig = sqliteTable("agent_config", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["builtin", "acp"] }).notNull(),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  maxConcurrency: integer("max_concurrency").notNull().default(4),
  updatedAt: integer("updated_at").notNull(),
});

export const modelConfig = sqliteTable("model_config", {
  name: text("name").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Folder name under WORKSPACES_ROOT; never a path. */
  folder: text("folder").notNull().unique(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  openedAt: integer("opened_at"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
