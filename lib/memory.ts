import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memories } from "@/lib/db/schema";

export const MAX_MEMORIES = 200;
export const MAX_MEMORY_CHARS = 500;
const PROMPT_MEMORIES = 30;

export type Memory = {
  id: string;
  content: string;
  source: "user" | "chat";
  conversationId: string | null;
  createdAt: number;
  updatedAt: number;
};

const STOP_WORDS = new Set(
  "a an and are as at be but by for from has have i i'm in is it its me my of on or our so that the their them they this to was we were what when which who will with you your".split(
    " ",
  ),
);

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

function similarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const EXPLICIT = [
  /^(?:please\s+)?(?:remember|memorize|note|keep in mind|don'?t forget)\s+(?:that\s+)?(.+)$/i,
  /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:remember|memorize|note)\s+(?:that\s+)?(.+?)\??$/i,
  /^(?:for future reference|from now on)[,:]?\s+(.+)$/i,
];

/**
 * Returns the fact to save when a message is an explicit request to remember
 * something. Ordinary messages return null; nothing is saved implicitly.
 */
export function explicitMemory(message: string) {
  const first = message.trim().split(/\n/)[0]?.trim() ?? "";
  if (first.length < 8 || first.length > MAX_MEMORY_CHARS + 40) return null;
  for (const pattern of EXPLICIT) {
    const match = pattern.exec(first);
    const fact = match?.[1]?.trim().replace(/[.!\s]+$/, "");
    if (fact && fact.length >= 3) {
      return fact.charAt(0).toUpperCase() + fact.slice(1);
    }
  }
  return null;
}

export function listMemories(userId: string): Memory[] {
  return db
    .select({
      id: memories.id,
      content: memories.content,
      source: memories.source,
      conversationId: memories.conversationId,
      createdAt: memories.createdAt,
      updatedAt: memories.updatedAt,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.updatedAt))
    .all();
}

export class MemoryError extends Error {}

/** Saves a memory, or refreshes a near-duplicate instead of adding another copy. */
export function addMemory(
  userId: string,
  content: string,
  options: { source?: "user" | "chat"; conversationId?: string | null } = {},
) {
  const text = content.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_CHARS);
  if (!text) throw new MemoryError("A memory cannot be empty.");
  const existing = listMemories(userId);
  const incoming = words(text);
  const duplicate = existing.find(
    (memory) =>
      memory.content.toLowerCase() === text.toLowerCase() ||
      similarity(words(memory.content), incoming) >= 0.75,
  );
  const now = Date.now();
  if (duplicate) {
    db.update(memories)
      .set({ content: text, updatedAt: now })
      .where(eq(memories.id, duplicate.id))
      .run();
    return { ...duplicate, content: text, updatedAt: now, updated: true };
  }
  if (existing.length >= MAX_MEMORIES) {
    throw new MemoryError(`Memory is full (${MAX_MEMORIES} items). Delete some to save more.`);
  }
  const memory = {
    id: crypto.randomUUID(),
    userId,
    content: text,
    source: options.source ?? "user",
    conversationId: options.conversationId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(memories).values(memory).run();
  return { ...memory, updated: false };
}

export function updateMemory(userId: string, id: string, content: string) {
  const text = content.replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_CHARS);
  if (!text) throw new MemoryError("A memory cannot be empty.");
  return (
    db
      .update(memories)
      .set({ content: text, updatedAt: Date.now() })
      .where(and(eq(memories.id, id), eq(memories.userId, userId)))
      .run().changes > 0
  );
}

export function deleteMemory(userId: string, id: string) {
  return (
    db
      .delete(memories)
      .where(and(eq(memories.id, id), eq(memories.userId, userId)))
      .run().changes > 0
  );
}

export function clearMemories(userId: string) {
  return db.delete(memories).where(eq(memories.userId, userId)).run().changes;
}

/** All memories when there are few; otherwise the ones closest to the message, newest first on ties. */
export function relevantMemories(userId: string, message: string) {
  const all = listMemories(userId);
  if (all.length <= PROMPT_MEMORIES) return all;
  const query = words(message);
  return all
    .map((memory, index) => ({ memory, score: similarity(words(memory.content), query), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, PROMPT_MEMORIES)
    .map((entry) => entry.memory);
}
