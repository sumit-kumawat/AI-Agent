import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    /** Which provider `model` belongs to. Null on chats from before providers existed (Ollama). */
    providerId: text("provider_id"),
    /** Auto mode ("intelligence", "balance", "cost"), or null when the user picked a model. */
    modelMode: text("model_mode"),
    pinnedAt: integer("pinned_at"),
    archivedAt: integer("archived_at"),
    /** Temporary chats stay out of history, search and memory. */
    temporary: integer("temporary", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("conversations_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    source: text("source", { enum: ["user", "chat"] }).notNull().default("user"),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("memories_user_idx").on(table.userId, table.updatedAt)],
);

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** JSON validated by `preferencesSchema`. */
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

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
    /** 1 for a thumbs up, -1 for a thumbs down. */
    feedback: integer("feedback"),
    /** JSON such as `{ "model": "...", "memory": "..." }`. */
    meta: text("meta"),
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
  providerId: text("provider_id"),
  /** Estimated cost in millionths of a US dollar. Null when the model has no price. */
  costMicro: integer("cost_micro"),
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

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["ollama", "openai", "anthropic", "google", "compatible"] }).notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  /** AES-256-GCM ciphertext. Never send this to the browser. */
  apiKeyEnc: text("api_key_enc"),
  /** Last four characters of the key, safe to display. */
  apiKeyHint: text("api_key_hint"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  healthOk: integer("health_ok", { mode: "boolean" }),
  healthAt: integer("health_at"),
  healthError: text("health_error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const providerModels = sqliteTable(
  "provider_models",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    /** False when the provider's last check no longer lists this model. */
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    inputPerMillion: real("input_per_million"),
    outputPerMillion: real("output_per_million"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.providerId, table.modelId] })],
);

export const modelConfig = sqliteTable("model_config", {
  name: text("name").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null until the file is sent with a message; unsent files are swept after a day. */
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["image", "pdf", "docx", "xlsx", "csv", "text", "code"] }).notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    textChars: integer("text_chars").notNull().default(0),
    pages: integer("pages"),
    truncated: integer("truncated", { mode: "boolean" }).notNull().default(false),
    warning: text("warning"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("attachments_user_idx").on(table.userId, table.createdAt),
    index("attachments_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

/** Extracted text in ~1,500-character sections, indexed for retrieval by `attachment_chunks_fts`. */
export const attachmentChunks = sqliteTable(
  "attachment_chunks",
  {
    attachmentId: text("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    content: text("content").notNull(),
  },
  (table) => [primaryKey({ columns: [table.attachmentId, table.seq] })],
);

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

export const modelSelections = sqliteTable(
  "model_selections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    task: text("task").notNull(),
    complexity: real("complexity").notNull(),
    providerId: text("provider_id").notNull(),
    model: text("model").notNull(),
    reason: text("reason").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("model_selections_user_idx").on(table.userId, table.createdAt)],
);
