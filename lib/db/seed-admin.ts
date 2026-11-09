import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

// Self-contained like migrate.ts: scripts/seed.mjs imports it with Node's type stripping.

type Sqlite = InstanceType<typeof Database>;

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const LOGIN_ID = /^[a-z0-9._%+-]+(@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})?$/;
const USERNAME = /^[a-z][a-z0-9._-]{2,31}$/;

export type AdminSeedResult =
  | { status: "skipped" }
  | { status: "invalid"; reason: string }
  | { status: "exists"; email: string; promoted: boolean }
  | { status: "created"; email: string };

/**
 * `next dev` expands `$name` inside .env values, which destroys a bcrypt hash
 * unless every `$` is written as `\$`. Node's own loader keeps the backslashes,
 * so strip them here and accept the hash either way.
 */
export function normalizeBcryptHash(raw: string | undefined) {
  return (raw ?? "").trim().replace(/\\\$/g, "$");
}

/**
 * First-run bootstrap: creates the Super Administrator named by ADMIN_EMAIL
 * (username ADMIN_USERNAME, default "admin") with the bcrypt hash in
 * ADMIN_PASSWORD_HASH, flagged to choose a new password on first sign-in.
 * Safe to run on every start: an existing account keeps its password.
 * Public registration never creates admins; this and the admin CLI are the only ways.
 */
export function seedAdminFromEnv(
  sqlite: Sqlite,
  env: Record<string, string | undefined> = process.env,
): AdminSeedResult {
  const email = (env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const hash = normalizeBcryptHash(env.ADMIN_PASSWORD_HASH);
  const username = (env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  if (!email && !hash) return { status: "skipped" };
  if (!email) return { status: "invalid", reason: "ADMIN_PASSWORD_HASH is set but ADMIN_EMAIL is not." };
  if (email.length < 3 || email.length > 254 || !LOGIN_ID.test(email)) {
    return { status: "invalid", reason: "ADMIN_EMAIL must be an email address." };
  }
  if (!USERNAME.test(username)) {
    return { status: "invalid", reason: "ADMIN_USERNAME must be 3 to 32 lowercase letters, digits, dots, dashes or underscores." };
  }

  const existing = sqlite.prepare("SELECT id, role, username FROM users WHERE email = ?").get(email) as
    | { id: string; role: string; username: string | null }
    | undefined;
  const holder = sqlite.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (existing) {
    const promoted = existing.role !== "superadmin";
    if (promoted) sqlite.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?").run(existing.id);
    if (existing.username !== username && !holder) {
      sqlite.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, existing.id);
    }
    return { status: "exists", email, promoted };
  }

  if (!hash) return { status: "invalid", reason: "ADMIN_EMAIL is set but ADMIN_PASSWORD_HASH is empty." };
  if (!BCRYPT_HASH.test(hash)) {
    return {
      status: "invalid",
      reason:
        "ADMIN_PASSWORD_HASH is not a bcrypt hash. Generate one with `npm run hash-password` and write each $ as \\$ in .env files.",
    };
  }

  const inserted = sqlite
    .prepare(
      `INSERT OR IGNORE INTO users (id, name, email, username, password_hash, role, first_login, created_at)
       VALUES (?, 'Administrator', ?, ?, ?, 'superadmin', 1, ?)`,
    )
    .run(randomUUID(), email, holder ? null : username, hash, Date.now());
  return inserted.changes > 0 ? { status: "created", email } : { status: "exists", email, promoted: false };
}
