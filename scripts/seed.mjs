// Creates one admin and one test user if they do not exist yet. Existing
// accounts are never modified. Passwords are printed once, when created.
//
//   npm run seed
//   SEED_ADMIN_EMAIL=me@example.com SEED_ADMIN_PASSWORD=... npm run seed
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { migrate } from "../lib/db/migrate.ts";

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

const accounts = [
  {
    name: "Admin",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@harbor.local",
    password: process.env.SEED_ADMIN_PASSWORD,
    role: "admin",
  },
  {
    name: "Test User",
    email: process.env.SEED_USER_EMAIL ?? "test@harbor.local",
    password: process.env.SEED_USER_PASSWORD,
    role: "user",
  },
];

const find = sqlite.prepare("SELECT id, role FROM users WHERE email = ?");
const insert = sqlite.prepare(
  "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);

for (const account of accounts) {
  const email = account.email.trim().toLowerCase();
  const existing = find.get(email);
  if (existing) {
    console.log(`exists   ${account.role.padEnd(5)}  ${email} (left unchanged, role: ${existing.role})`);
    continue;
  }
  const password = account.password ?? randomBytes(12).toString("base64url");
  if (new TextEncoder().encode(password).length < 8 || new TextEncoder().encode(password).length > 72) {
    console.error(`skipped  ${email}: password must be 8 to 72 bytes`);
    process.exitCode = 1;
    continue;
  }
  insert.run(randomUUID(), account.name, email, bcrypt.hashSync(password, 12), account.role, Date.now());
  console.log(`created  ${account.role.padEnd(5)}  ${email}  password: ${account.password ? "(from environment)" : password}`);
}

sqlite.close();
