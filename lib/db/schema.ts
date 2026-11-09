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

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Folder name under WORKSPACES_ROOT; never a path. */
  folder: text("folder").notNull().unique(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  openedAt: integer("opened_at"),
});

export const billingProfiles = sqliteTable("billing_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  company: text("company"),
  address1: text("address1"),
  address2: text("address2"),
  city: text("city"),
  state: text("state"),
  postcode: text("postcode"),
  /** ISO 3166-1 alpha-2. */
  country: text("country"),
  phone: text("phone"),
  /** GSTIN or other tax registration number. */
  taxId: text("tax_id"),
  currency: text("currency", { enum: ["INR", "USD"] }).notNull().default("INR"),
  updatedAt: integer("updated_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  /** Website catalogue group, such as "vps-hosting". */
  groupSlug: text("group_slug").notNull(),
  /** "ai" plans set the member's chat plan and token quota while paid. */
  kind: text("kind", { enum: ["hosting", "ai"] }).notNull().default("hosting"),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  /** One feature per line. */
  features: text("features").notNull().default(""),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(true),
  sort: integer("sort").notNull().default(0),
  aiQuotaTokens: integer("ai_quota_tokens"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const productPrices = sqliteTable(
  "product_prices",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    currency: text("currency", { enum: ["INR", "USD"] }).notNull(),
    cycle: text("cycle", {
      enum: ["monthly", "quarterly", "semiannually", "annually", "biennially", "triennially", "onetime"],
    }).notNull(),
    /** Paise or cents. */
    amountMinor: integer("amount_minor").notNull(),
    setupMinor: integer("setup_minor").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.productId, table.currency, table.cycle] })],
);

export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    /** Product name when ordered, so renaming a product does not rewrite history. */
    name: text("name").notNull(),
    kind: text("kind", { enum: ["hosting", "ai"] }).notNull().default("hosting"),
    status: text("status", { enum: ["pending", "active", "suspended", "cancelled"] }).notNull(),
    cycle: text("cycle").notNull(),
    currency: text("currency", { enum: ["INR", "USD"] }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    /** Customer-supplied label, such as the domain the service is for. */
    label: text("label"),
    nextDueAt: integer("next_due_at"),
    activatedAt: integer("activated_at"),
    cancelledAt: integer("cancelled_at"),
    cancelRequestedAt: integer("cancel_requested_at"),
    aiQuotaTokens: integer("ai_quota_tokens"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("services_user_idx").on(table.userId, table.createdAt)],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["unpaid", "paid", "cancelled"] }).notNull(),
    currency: text("currency", { enum: ["INR", "USD"] }).notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxRate: real("tax_rate").notNull().default(0),
    taxLabel: text("tax_label").notNull().default(""),
    taxMinor: integer("tax_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    /** JSON snapshot of the customer's billing details when issued. */
    billTo: text("bill_to").notNull(),
    projectId: text("project_id"),
    dueAt: integer("due_at").notNull(),
    paidAt: integer("paid_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("invoices_user_idx").on(table.userId, table.createdAt)],
);

export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["new", "renewal", "setup", "proposal", "manual"] }).notNull(),
  description: text("description").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  serviceId: text("service_id").references(() => services.id, { onDelete: "set null" }),
  periodStart: integer("period_start"),
  periodEnd: integer("period_end"),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  gateway: text("gateway", { enum: ["razorpay", "manual"] }).notNull(),
  gatewayOrderId: text("gateway_order_id").unique(),
  gatewayPaymentId: text("gateway_payment_id").unique(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: text("status", { enum: ["created", "captured", "failed"] }).notNull(),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    requirements: text("requirements").notNull(),
    budget: text("budget").notNull().default(""),
    timeline: text("timeline").notNull().default(""),
    status: text("status").notNull().default("submitted"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("projects_user_idx").on(table.userId, table.updatedAt)],
);

export const projectUpdates = sqliteTable("project_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorType: text("author_type", { enum: ["client", "staff", "system"] }).notNull(),
  authorId: text("author_id"),
  status: text("status"),
  message: text("message").notNull(),
  visibleToClient: integer("visible_to_client", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  currency: text("currency", { enum: ["INR", "USD"] }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  status: text("status", { enum: ["sent", "accepted", "declined", "withdrawn"] }).notNull(),
  invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  respondedAt: integer("responded_at"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
