import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "@/lib/env";
import { assignMissingIds, migrate } from "./migrate";
import { seedAdminFromEnv } from "./seed-admin";
import * as schema from "./schema";

const dataDir = path.resolve(
  /*turbopackIgnore: true*/ env.DATA_DIR ?? path.join(process.cwd(), "data"),
);
fs.mkdirSync(dataDir, { recursive: true });

const filename = path.join(dataDir, "harbor.db");

type SqliteDatabase = InstanceType<typeof Database>;

const globalForDb = globalThis as unknown as {
  harborDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function openDatabase() {
  if (globalForDb.harborDb) return globalForDb.harborDb;

  const sqlite: SqliteDatabase = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  migrate(sqlite);

  const seeded = seedAdminFromEnv(sqlite);
  if (seeded.status === "created") {
    console.info(`Created admin "${seeded.email}" from ADMIN_EMAIL. It must choose a new password on first sign-in.`);
  } else if (seeded.status === "invalid") {
    console.warn(`Admin seed skipped: ${seeded.reason}`);
  }

  assignMissingIds(sqlite);

  const database = drizzle(sqlite, { schema });
  globalForDb.harborDb = database;
  return database;
}

export const db = openDatabase();

/** The SQLite file, for size and health reporting. */
export const databaseFile = filename;
export const dataDirectory = dataDir;
