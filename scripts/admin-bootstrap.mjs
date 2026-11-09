// Makes an account the Super Administrator, or recovers one that is locked
// out. Needs shell access to the server, which is the trust boundary: nothing
// here is reachable over HTTP. The password is read from stdin (typed without
// echo, or piped), hashed with bcrypt, and never printed or stored in plain
// text. The account must choose a new password at its next sign-in, and every
// existing session is ended.
//
//   npm run admin:bootstrap -- --email you@example.com [--username admin]
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import readline from "node:readline";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { assignMissingIds, migrate } from "../lib/db/migrate.ts";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const email = (option("email") ?? "").trim().toLowerCase();
const username = (option("username") ?? "admin").trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run admin:bootstrap -- --email you@example.com [--username admin]");
  process.exit(1);
}
if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username)) {
  console.error("The username must be 3 to 32 lowercase letters, digits, dots, dashes or underscores.");
  process.exit(1);
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (text) => {
    if (text.includes("password")) process.stdout.write(text);
  };
  const answer = await new Promise((resolve) => rl.question("Initial password (not shown): ", resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = await readPassword();
const bytes = new TextEncoder().encode(password).length;
if (bytes < 8 || bytes > 72) {
  console.error("The password must be 8 to 72 bytes.");
  process.exit(1);
}

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

const hash = bcrypt.hashSync(password, 12);
const outcome = sqlite
  .transaction(() => {
    const holder = sqlite.prepare("SELECT id, email FROM users WHERE username = ?").get(username);
    let user = sqlite.prepare("SELECT id, role FROM users WHERE email = ?").get(email);
    if (holder && (!user || holder.id !== user.id)) {
      throw new Error(`The username "${username}" belongs to ${holder.email}. Pick another with --username.`);
    }
    const created = !user;
    if (!user) {
      const id = randomUUID();
      sqlite
        .prepare(
          `INSERT INTO users (id, name, email, username, password_hash, role, first_login, created_at)
           VALUES (?, 'Administrator', ?, ?, ?, 'superadmin', 1, ?)`,
        )
        .run(id, email, username, hash, Date.now());
      user = { id, role: "user" };
    } else {
      sqlite
        .prepare(
          `UPDATE users SET username = ?, password_hash = ?, role = 'superadmin', suspended = 0,
             first_login = 1, session_version = session_version + 1 WHERE id = ?`,
        )
        .run(username, hash, user.id);
    }
    sqlite
      .prepare(
        `INSERT INTO admin_audit_log (admin_id, admin_email, action, target_type, target_id, details, created_at)
         VALUES ('system', 'server-cli', 'admin.bootstrap', 'user', ?, ?, ?)`,
      )
      .run(user.id, JSON.stringify({ email, username, from: created ? null : user.role, to: "superadmin", created }), Date.now());
    return { created, previousRole: user.role };
  })
  .immediate();
assignMissingIds(sqlite);
const row = sqlite.prepare("SELECT public_id AS publicId FROM users WHERE email = ?").get(email);
sqlite.close();

console.log(
  `${outcome.created ? "Created" : "Updated"} ${email}: username "${username}", Super Administrator, user ID ${row.publicId}.`,
);
console.log("The password must be changed at the next sign-in. Existing sessions were ended.");
