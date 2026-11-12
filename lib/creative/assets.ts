import fs from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { creativeAssets } from "@/lib/db/schema";
import type { CreativeAssetRow } from "@/lib/creative/types";

export const creativeRoot = path.resolve(
  /*turbopackIgnore: true*/ path.join(env.DATA_DIR ?? path.join(process.cwd(), "data"), "creative"),
);

function parseJsonArray(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapAsset(row: typeof creativeAssets.$inferSelect): CreativeAssetRow {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    name: row.name,
    path: row.path,
    mime: row.mime,
    size: row.size,
    meta: parseJsonObject(row.meta),
    tags: parseJsonArray(row.tags),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function userCreativeDir(userId: string) {
  const dir = path.join(creativeRoot, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listAssetsForUser(userId: string, opts: { kind?: string; q?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let rows = db
    .select()
    .from(creativeAssets)
    .where(eq(creativeAssets.userId, userId))
    .orderBy(desc(creativeAssets.createdAt))
    .limit(limit)
    .all()
    .map(mapAsset);
  if (opts.kind) rows = rows.filter((row) => row.kind === opts.kind);
  if (opts.q) {
    const needle = opts.q.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.tags.some((tag) => tag.toLowerCase().includes(needle)),
    );
  }
  return rows;
}

export function getAssetForUser(id: string, userId: string) {
  const row = db
    .select()
    .from(creativeAssets)
    .where(and(eq(creativeAssets.id, id), eq(creativeAssets.userId, userId)))
    .get();
  return row ? mapAsset(row) : null;
}

export function createAssetRecord(input: {
  userId: string;
  kind: string;
  name: string;
  relativePath: string;
  mime: string;
  size: number;
  meta?: Record<string, unknown>;
  tags?: string[];
}) {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.insert(creativeAssets)
    .values({
      id,
      userId: input.userId,
      kind: input.kind,
      name: input.name,
      path: input.relativePath,
      mime: input.mime,
      size: input.size,
      meta: JSON.stringify(input.meta ?? {}),
      tags: JSON.stringify(input.tags ?? []),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getAssetForUser(id, input.userId)!;
}

export function deleteAssetForUser(id: string, userId: string) {
  const asset = getAssetForUser(id, userId);
  if (!asset) return false;
  const absolute = path.join(creativeRoot, userId, asset.path);
  // Stay inside the user's creative directory.
  if (absolute.startsWith(path.join(creativeRoot, userId) + path.sep) || absolute === path.join(creativeRoot, userId)) {
    fs.rmSync(absolute, { force: true });
  }
  db.delete(creativeAssets).where(and(eq(creativeAssets.id, id), eq(creativeAssets.userId, userId))).run();
  return true;
}
