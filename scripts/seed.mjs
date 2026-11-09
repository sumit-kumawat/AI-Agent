// Seeds the admin from ADMIN_EMAIL + ADMIN_PASSWORD_HASH (the same rule the
// server applies on startup) and a test user. Existing accounts keep their
// passwords. No password is stored in this file.
//
//   npm run seed
//   SEED_USER_EMAIL=qa@example.com SEED_USER_PASSWORD=... npm run seed
//   SEED_USER_PLAN=advance ...        (free by default)
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { assignMissingIds, migrate } from "../lib/db/migrate.ts";
import { seedAdminFromEnv } from "../lib/db/seed-admin.ts";

const root = process.cwd();
for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, "data"));
fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(path.join(dataDir, "harbor.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
migrate(sqlite);

const admin = seedAdminFromEnv(sqlite);
if (admin.status === "created") {
  console.log(`created  admin  ${admin.email}  (password from ADMIN_PASSWORD_HASH; must be changed on first sign-in)`);
} else if (admin.status === "exists") {
  console.log(`exists   admin  ${admin.email}  (password left unchanged${admin.promoted ? ", promoted to admin" : ""})`);
} else if (admin.status === "invalid") {
  console.error(`skipped  admin: ${admin.reason}`);
  process.exitCode = 1;
} else {
  console.log("skipped  admin: set ADMIN_EMAIL and ADMIN_PASSWORD_HASH to seed one");
}

if (process.env.SEED_USER !== "0") {
  const email = (process.env.SEED_USER_EMAIL ?? "test@harbor.local").trim().toLowerCase();
  const existing = sqlite.prepare("SELECT role FROM users WHERE email = ?").get(email);
  if (existing) {
    console.log(`exists   user   ${email}  (left unchanged, role: ${existing.role})`);
  } else {
    const password = process.env.SEED_USER_PASSWORD ?? randomBytes(12).toString("base64url");
    const bytes = new TextEncoder().encode(password).length;
    if (bytes < 8 || bytes > 72) {
      console.error(`skipped  user   ${email}: password must be 8 to 72 bytes`);
      process.exitCode = 1;
    } else {
      const plan = ["free", "basic", "advance"].includes(process.env.SEED_USER_PLAN) ? process.env.SEED_USER_PLAN : "free";
      const now = Date.now();
      sqlite
        .prepare(
          "INSERT INTO users (id, name, email, password_hash, role, plan, plan_started_at, created_at) VALUES (?, 'Test User', ?, ?, 'user', ?, ?, ?)",
        )
        .run(randomUUID(), email, bcrypt.hashSync(password, 12), plan, now, now);
      console.log(
        `created  user   ${email}  plan: ${plan}  password: ${process.env.SEED_USER_PASSWORD ? "(from environment)" : password}`,
      );
    }
  }
}

assignMissingIds(sqlite);
sqlite.close();
