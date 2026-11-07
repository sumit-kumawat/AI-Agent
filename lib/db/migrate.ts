import type Database from "better-sqlite3";

// Self-contained on purpose: scripts/seed.mjs imports this file directly with
// Node's type stripping, so it must not use path aliases or TS-only syntax.

type Sqlite = InstanceType<typeof Database>;

function hasColumn(sqlite: Sqlite, table: string, column: string) {
  const columns = sqlite.pragma(`table_info(${table})`) as { name: string }[];
  return columns.some((existing) => existing.name === column);
}

function addColumn(sqlite: Sqlite, table: string, column: string, definition: string) {
  if (!hasColumn(sqlite, table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const MIGRATIONS: ((sqlite: Sqlite) => void)[] = [
  // 1: users, conversations, messages. Idempotent so databases created before
  // versioning existed upgrade cleanly.
  (sqlite) => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
        ON conversations (user_id, updated_at);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
        ON messages (conversation_id, created_at);
    `);
    addColumn(sqlite, "conversations", "model", "TEXT");
  },

  // 2: roles, suspension, quotas, usage, rate-limit log, audit log, agent and
  // model control, global settings, message flags.
  (sqlite) => {
    addColumn(sqlite, "users", "role", "TEXT NOT NULL DEFAULT 'user'");
    addColumn(sqlite, "users", "suspended", "INTEGER NOT NULL DEFAULT 0");
    addColumn(sqlite, "users", "plan", "TEXT NOT NULL DEFAULT 'free'");
    addColumn(sqlite, "users", "quota_tokens", "INTEGER");
    addColumn(sqlite, "users", "quota_used", "INTEGER NOT NULL DEFAULT 0");
    addColumn(sqlite, "users", "quota_period", "TEXT");
    addColumn(sqlite, "users", "tokens_total", "INTEGER NOT NULL DEFAULT 0");
    addColumn(sqlite, "users", "last_active_at", "INTEGER");
    addColumn(sqlite, "users", "session_version", "INTEGER NOT NULL DEFAULT 0");

    addColumn(sqlite, "messages", "flagged", "INTEGER NOT NULL DEFAULT 0");
    addColumn(sqlite, "messages", "flag_reason", "TEXT");
    addColumn(sqlite, "messages", "flagged_by", "TEXT");
    addColumn(sqlite, "messages", "flagged_at", "INTEGER");

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at);
      CREATE INDEX IF NOT EXISTS messages_flagged_idx ON messages (flagged);

      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        conversation_id TEXT,
        agent_id TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events (created_at);
      CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON usage_events (user_id, created_at);

      CREATE TABLE IF NOT EXISTS rate_limit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        ip TEXT,
        endpoint TEXT NOT NULL,
        limit_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS rate_limit_events_created_idx ON rate_limit_events (created_at);

      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id TEXT NOT NULL,
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at);

      CREATE TABLE IF NOT EXISTS agent_config (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        max_concurrency INTEGER NOT NULL DEFAULT 4,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_config (
        name TEXT PRIMARY KEY NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const now = Date.now();
    const seedAgent = sqlite.prepare(
      `INSERT OR IGNORE INTO agent_config (id, name, kind, description, enabled, max_concurrency, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    seedAgent.run("ollama", "Ollama chat", "builtin", "Streams replies from local Ollama models.", 1, 8, now);
    seedAgent.run("claude", "Claude (ACP)", "acp", "Agent Client Protocol adapter for Claude Code.", 0, 2, now);
    seedAgent.run("codex", "Codex (ACP)", "acp", "Agent Client Protocol adapter for OpenAI Codex.", 0, 2, now);
    seedAgent.run("gemini", "Gemini (ACP)", "acp", "Agent Client Protocol adapter for Gemini CLI.", 0, 2, now);

    // Earlier releases treated the oldest account as the admin; keep that person in charge.
    const admins = sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number };
    if (admins.count === 0) {
      sqlite.exec(
        "UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1)",
      );
    }
  },

  // 3: accounts that must choose a new password before using the app (the
  // env-seeded admin, and anyone given a temporary password by an admin).
  (sqlite) => {
    addColumn(sqlite, "users", "first_login", "INTEGER NOT NULL DEFAULT 0");
  },
];

function version(sqlite: Sqlite) {
  return sqlite.pragma("user_version", { simple: true }) as number;
}

/**
 * Applies every migration newer than the database's PRAGMA user_version.
 * Several processes (build workers, the server, the seed script) may race
 * here, so the work runs in an IMMEDIATE transaction, which waits for the
 * write lock, and re-reads the version once the lock is held.
 */
export function migrate(sqlite: Sqlite) {
  if (version(sqlite) >= MIGRATIONS.length) return;
  sqlite
    .transaction(() => {
      for (let current = version(sqlite); current < MIGRATIONS.length; current += 1) {
        MIGRATIONS[current]!(sqlite);
        sqlite.pragma(`user_version = ${current + 1}`);
      }
    })
    .immediate();
}
