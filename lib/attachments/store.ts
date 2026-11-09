import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { extract, FileRejected } from "@/lib/attachments/extract";
import {
  kindForName,
  limitFor,
  MAX_FILES_PER_MESSAGE,
  USER_STORAGE_BYTES,
  type AttachmentInfo,
} from "@/lib/attachments/types";
import { db } from "@/lib/db";
import { attachmentChunks, attachments } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/format";

export { FileRejected };

export const uploadsRoot = path.resolve(
  /*turbopackIgnore: true*/ path.join(env.DATA_DIR ?? path.join(process.cwd(), "data"), "uploads"),
);

const CHUNK_CHARS = 1500;
const UNSENT_TTL_MS = 24 * 60 * 60 * 1000;

export type Attachment = typeof attachments.$inferSelect;

/** Files are stored by id only; the user's file name never becomes part of a path. */
function filePath(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId) || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid attachment path.");
  return path.join(uploadsRoot, userId, id);
}

export function cleanName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 180);
}

export function toInfo(row: Attachment): AttachmentInfo {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    chars: row.textChars,
    pages: row.pages,
    warning: row.warning,
  };
}

/** Consecutive sections that join back into the full text; split on paragraph or sentence breaks where possible. */
export function chunkText(text: string) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK_CHARS);
    if (end < text.length) {
      const window = text.slice(start + CHUNK_CHARS / 2, end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
      if (breakAt > 0) end = start + CHUNK_CHARS / 2 + breakAt + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    start = end;
  }
  return chunks;
}

export function storageUsed(userId: string) {
  return (
    db
      .select({ total: sql<number>`coalesce(sum(${attachments.size}), 0)` })
      .from(attachments)
      .where(eq(attachments.userId, userId))
      .get()?.total ?? 0
  );
}

/** Validates, extracts and stores one upload. Throws FileRejected with a message for the person. */
export async function saveUpload(userId: string, file: { name: string; bytes: Buffer }) {
  const name = cleanName(file.name);
  const kind = kindForName(name);
  if (!kind) throw new FileRejected(`${name}: this file type is not supported.`);
  const limit = limitFor(kind);
  if (file.bytes.length > limit) {
    throw new FileRejected(`${name} is ${formatBytes(file.bytes.length)}. The limit for this type is ${formatBytes(limit)}.`);
  }
  if (storageUsed(userId) + file.bytes.length > USER_STORAGE_BYTES) {
    throw new FileRejected(
      `Your file storage is full (${formatBytes(USER_STORAGE_BYTES)}). Delete chats with large attachments to free space.`,
    );
  }
  let extracted;
  try {
    extracted = await extract(kind, file.bytes);
  } catch (error) {
    if (error instanceof FileRejected) throw new FileRejected(`${name}: ${error.message}`);
    throw new FileRejected(`${name} could not be read.`);
  }

  const id = randomUUID();
  const target = filePath(userId, id);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, file.bytes, { mode: 0o600 });
  try {
    const now = Date.now();
    db.transaction((tx) => {
      tx.insert(attachments)
        .values({
          id,
          userId,
          name,
          kind,
          mime: extracted.mime,
          size: file.bytes.length,
          sha256: createHash("sha256").update(file.bytes).digest("hex"),
          textChars: extracted.text.length,
          pages: extracted.pages,
          truncated: extracted.truncated,
          warning: extracted.warning,
          createdAt: now,
        })
        .run();
      chunkText(extracted.text).forEach((content, seq) => {
        tx.insert(attachmentChunks).values({ attachmentId: id, seq, content }).run();
      });
    });
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  }
  return toInfo(getAttachment(id, userId)!);
}

export function getAttachment(id: string, userId: string) {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .get();
}

export function readAttachmentFile(row: Attachment) {
  return fs.readFileSync(filePath(row.userId, row.id));
}

export function deleteAttachment(id: string, userId: string) {
  const row = getAttachment(id, userId);
  if (!row) return false;
  db.delete(attachments).where(eq(attachments.id, id)).run();
  fs.rmSync(filePath(userId, id), { force: true });
  return true;
}

export class AttachmentError extends Error {}

/**
 * The files referenced by a request. Each must belong to the user and be
 * unsent or already part of this conversation. Changes nothing.
 */
export function ownedAttachments(userId: string, conversationId: string, byMessage: Map<string, string[]>) {
  for (const ids of byMessage.values()) {
    if (ids.length > MAX_FILES_PER_MESSAGE) {
      throw new AttachmentError(`Attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
    }
  }
  const unique = [...new Set([...byMessage.values()].flat())];
  if (unique.length === 0) return new Map<string, Attachment>();
  const rows = db
    .select()
    .from(attachments)
    .where(and(eq(attachments.userId, userId), inArray(attachments.id, unique)))
    .all();
  if (rows.length !== unique.length || rows.some((row) => row.conversationId && row.conversationId !== conversationId)) {
    throw new AttachmentError("One of the attached files is no longer available. Remove it and attach it again.");
  }
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Records which message each file was sent with, then removes files whose
 * message no longer exists (an edit replaced it without them).
 */
export function bindAttachments(userId: string, conversationId: string, byMessage: Map<string, string[]>) {
  db.transaction((tx) => {
    for (const [messageId, ids] of byMessage) {
      if (ids.length === 0) continue;
      tx.update(attachments)
        .set({ conversationId, messageId })
        .where(and(eq(attachments.userId, userId), inArray(attachments.id, ids)))
        .run();
    }
  });
  const dropped = db.$client
    .prepare(
      `SELECT id FROM attachments
        WHERE conversation_id = ? AND message_id IS NOT NULL
          AND message_id NOT IN (SELECT id FROM messages WHERE conversation_id = ?)`,
    )
    .all(conversationId, conversationId) as { id: string }[];
  for (const row of dropped) deleteAttachment(row.id, userId);
}

export function conversationAttachments(conversationId: string) {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.conversationId, conversationId))
    .orderBy(asc(attachments.createdAt))
    .all();
}

/** For rendering stored messages: message id -> its files. */
export function attachmentsByMessage(conversationId: string) {
  const map = new Map<string, AttachmentInfo[]>();
  for (const row of conversationAttachments(conversationId)) {
    if (!row.messageId) continue;
    const list = map.get(row.messageId) ?? [];
    list.push(toInfo(row));
    map.set(row.messageId, list);
  }
  return map;
}

export function chunksOf(attachmentId: string) {
  return db
    .select({ seq: attachmentChunks.seq, content: attachmentChunks.content })
    .from(attachmentChunks)
    .where(eq(attachmentChunks.attachmentId, attachmentId))
    .orderBy(asc(attachmentChunks.seq))
    .all();
}

/** Sections most relevant to `query` across the given files, best first. */
export function searchChunks(attachmentIds: string[], query: string, limit = 24) {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .slice(0, 16);
  if (terms.length === 0 || attachmentIds.length === 0) return [];
  const match = terms.map((term) => `"${term}"`).join(" OR ");
  const placeholders = attachmentIds.map(() => "?").join(",");
  return db.$client
    .prepare(
      `SELECT attachment_id AS attachmentId, seq, content
         FROM attachment_chunks_fts
        WHERE attachment_chunks_fts MATCH ? AND attachment_id IN (${placeholders})
        ORDER BY rank
        LIMIT ?`,
    )
    .all(match, ...attachmentIds, limit) as { attachmentId: string; seq: number; content: string }[];
}

/** Deletes stored bytes whose row is gone, e.g. after the user deleted chats. */
export function pruneUserFiles(userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) return;
  const dir = path.join(uploadsRoot, userId);
  if (!fs.existsSync(dir)) return;
  const known = new Set(
    db.select({ id: attachments.id }).from(attachments).where(eq(attachments.userId, userId)).all().map((row) => row.id),
  );
  for (const file of fs.readdirSync(dir)) {
    if (!known.has(file)) fs.rmSync(path.join(dir, file), { force: true });
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

/**
 * Removes files that were uploaded but never sent, files whose chat was
 * deleted (the row is gone but the bytes remain), and empty folders.
 */
export function sweepAttachments(now = Date.now()) {
  const stale = db
    .select({ id: attachments.id, userId: attachments.userId })
    .from(attachments)
    .where(and(isNull(attachments.conversationId), lt(attachments.createdAt, now - UNSENT_TTL_MS)))
    .all();
  for (const row of stale) deleteAttachment(row.id, row.userId);

  let orphans = 0;
  if (fs.existsSync(uploadsRoot)) {
    const known = new Set(db.select({ id: attachments.id }).from(attachments).all().map((row) => row.id));
    for (const userDir of fs.readdirSync(uploadsRoot)) {
      const dir = path.join(uploadsRoot, userDir);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!known.has(file)) {
          fs.rmSync(path.join(dir, file), { force: true });
          orphans += 1;
        }
      }
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
  }
  return { unsent: stale.length, orphans };
}