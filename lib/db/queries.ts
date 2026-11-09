import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "./index";
import { conversations, messages, modelConfig, modelSelections, usageEvents, users } from "./schema";

const MAX_STORED_CHARS = 200_000;

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: number;
  pinnedAt: number | null;
};

function bounded(content: string) {
  return content.length > MAX_STORED_CHARS
    ? content.slice(0, MAX_STORED_CHARS)
    : content;
}

export function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).get();
}

/**
 * Sign-in lookup. An exact email wins. A username matches when exactly one
 * account uses it as the part before @, so "admin" and "admin@conzex.com"
 * are the same account.
 */
export function findUserByLogin(identifier: string, preferredEmail?: string) {
  const exact = findUserByEmail(identifier);
  if (exact || identifier.includes("@")) return exact;
  if (preferredEmail && preferredEmail.split("@")[0] === identifier) {
    const preferred = findUserByEmail(preferredEmail);
    if (preferred) return preferred;
  }
  const pattern = `${identifier.replace(/[\\%_]/g, (char) => `\\${char}`)}@%`;
  const matches = db
    .select()
    .from(users)
    .where(sql`${users.email} LIKE ${pattern} ESCAPE '\\'`)
    .all()
    .filter((user) => user.email.split("@")[0] === identifier);
  return matches.length === 1 ? matches[0] : undefined;
}

export function findUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function deleteUser(id: string) {
  db.delete(users).where(eq(users.id, id)).run();
}

export function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role?: "admin" | "user";
}) {
  const id = crypto.randomUUID();
  db.insert(users)
    .values({
      id,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role ?? "user",
      createdAt: Date.now(),
    })
    .run();
  return { id, name: input.name, email: input.email };
}

export function adminCount() {
  return (
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "admin"))
      .get()?.count ?? 0
  );
}

export function currentQuotaPeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

/** Returns the user's monthly allowance state, rolling usage over when the month changes. */
export function quotaState(userId: string) {
  const user = findUserById(userId);
  if (!user) return null;
  const period = currentQuotaPeriod();
  const used = user.quotaPeriod === period ? user.quotaUsed : 0;
  return {
    limit: user.quotaTokens,
    used,
    exceeded: user.quotaTokens !== null && used >= user.quotaTokens,
  };
}

export function touchUser(userId: string) {
  db.update(users).set({ lastActiveAt: Date.now() }).where(eq(users.id, userId)).run();
}

export function recordUsage(event: {
  userId: string;
  conversationId: string | null;
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: "ok" | "aborted" | "error" | "blocked";
  providerId?: string | null;
  costMicro?: number | null;
}) {
  const total = event.inputTokens + event.outputTokens;
  const now = Date.now();
  const period = currentQuotaPeriod();
  db.transaction((tx) => {
    tx.insert(usageEvents)
      .values({
        ...event,
        providerId: event.providerId ?? null,
        costMicro: event.costMicro ?? null,
        totalTokens: total,
        createdAt: now,
      })
      .run();
    tx.update(users)
      .set({
        tokensTotal: sql`${users.tokensTotal} + ${total}`,
        quotaUsed: sql`CASE WHEN ${users.quotaPeriod} = ${period} THEN ${users.quotaUsed} + ${total} ELSE ${total} END`,
        quotaPeriod: period,
        lastActiveAt: now,
      })
      .where(eq(users.id, event.userId))
      .run();
  });
}

export function disabledModelNames() {
  return new Set(
    db
      .select({ name: modelConfig.name })
      .from(modelConfig)
      .where(eq(modelConfig.enabled, false))
      .all()
      .map((row) => row.name),
  );
}

export function renameConversation(id: string, userId: string, title: string) {
  const result = db
    .update(conversations)
    .set({ title, updatedAt: Date.now() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .run();
  return result.changes > 0;
}

const TEMPORARY_TTL = 24 * 60 * 60 * 1000;

/** History for the sidebar: saved, unarchived chats, pinned first. */
export function listConversations(userId: string): ConversationListItem[] {
  db.delete(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.temporary, true),
        lt(conversations.updatedAt, Date.now() - TEMPORARY_TTL),
      ),
    )
    .run();
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      pinnedAt: conversations.pinnedAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.temporary, false),
        isNull(conversations.archivedAt),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .all();
}

export function listArchivedConversations(userId: string) {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      archivedAt: conversations.archivedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.userId, userId), isNotNull(conversations.archivedAt)))
    .orderBy(desc(conversations.archivedAt))
    .all();
}

export function recentConversationTitles(userId: string, excludeId: string, limit = 8) {
  return db
    .select({ title: conversations.title, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.temporary, false),
        isNull(conversations.archivedAt),
        ne(conversations.id, excludeId),
        ne(conversations.title, "New chat"),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .all();
}

export function updateConversationFlags(
  id: string,
  userId: string,
  flags: { pinned?: boolean; archived?: boolean },
) {
  const set: { pinnedAt?: number | null; archivedAt?: number | null } = {};
  if (flags.pinned !== undefined) set.pinnedAt = flags.pinned ? Date.now() : null;
  if (flags.archived !== undefined) {
    set.archivedAt = flags.archived ? Date.now() : null;
    if (flags.archived) set.pinnedAt = null;
  }
  if (Object.keys(set).length === 0) return true;
  return (
    db
      .update(conversations)
      .set(set)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.userId, userId),
          eq(conversations.temporary, false),
        ),
      )
      .run().changes > 0
  );
}

export function archiveAllConversations(userId: string) {
  return db
    .update(conversations)
    .set({ archivedAt: Date.now(), pinnedAt: null })
    .where(
      and(
        eq(conversations.userId, userId),
        isNull(conversations.archivedAt),
        eq(conversations.temporary, false),
      ),
    )
    .run().changes;
}

export function restoreAllConversations(userId: string) {
  return db
    .update(conversations)
    .set({ archivedAt: null })
    .where(and(eq(conversations.userId, userId), isNotNull(conversations.archivedAt)))
    .run().changes;
}

export function deleteAllConversations(userId: string, scope: "all" | "archived") {
  return db
    .delete(conversations)
    .where(
      scope === "archived"
        ? and(eq(conversations.userId, userId), isNotNull(conversations.archivedAt))
        : eq(conversations.userId, userId),
    )
    .run().changes;
}

export type SearchResult = {
  id: string;
  title: string;
  updatedAt: number;
  archived: boolean;
  snippet: string | null;
};

/** Turns free text into a safe FTS5 prefix query, or null when nothing searchable is left. */
function ftsQuery(text: string) {
  const terms = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return terms.length ? terms.map((term) => `"${term}"*`).join(" ") : null;
}

/** Searches the user's saved chats by title and message text, including archived ones. */
export function searchConversations(userId: string, text: string, limit = 30): SearchResult[] {
  const query = text.trim();
  if (!query) return [];
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const byTitle = db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      archivedAt: conversations.archivedAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.temporary, false),
        sql`${conversations.title} LIKE ${pattern} ESCAPE '\\'`,
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .all();

  const match = ftsQuery(query);
  const byContent = match
    ? (db.$client
        .prepare(
          `SELECT c.id AS id, c.title AS title, c.updated_at AS updatedAt, c.archived_at AS archivedAt,
                  snippet(messages_fts, 0, '', '', '…', 12) AS snippet
             FROM messages_fts
             JOIN conversations c ON c.id = messages_fts.conversation_id
            WHERE messages_fts MATCH ? AND c.user_id = ? AND c.temporary = 0
            ORDER BY rank
            LIMIT 200`,
        )
        .all(match, userId) as {
        id: string;
        title: string;
        updatedAt: number;
        archivedAt: number | null;
        snippet: string;
      }[])
    : [];

  const results = new Map<string, SearchResult>();
  for (const row of byTitle) {
    results.set(row.id, {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
      archived: row.archivedAt !== null,
      snippet: null,
    });
  }
  for (const row of byContent) {
    const existing = results.get(row.id);
    if (existing) {
      existing.snippet ??= row.snippet;
      continue;
    }
    results.set(row.id, {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
      archived: row.archivedAt !== null,
      snippet: row.snippet,
    });
  }
  return [...results.values()].slice(0, limit);
}

export function setMessageFeedback(messageId: string, userId: string, feedback: 1 | -1 | null) {
  const owned = db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.id, messageId),
        eq(conversations.userId, userId),
        eq(messages.role, "assistant"),
      ),
    )
    .get();
  if (!owned) return false;
  db.update(messages).set({ feedback }).where(eq(messages.id, messageId)).run();
  return true;
}

/** Everything a user owns, for the data export. */
export function exportUserConversations(userId: string) {
  const owned = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.temporary, false)))
    .orderBy(asc(conversations.createdAt))
    .all();
  return owned.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    pinned: conversation.pinnedAt !== null,
    archived: conversation.archivedAt !== null,
    createdAt: new Date(conversation.createdAt).toISOString(),
    updatedAt: new Date(conversation.updatedAt).toISOString(),
    messages: listMessages(conversation.id).map((message) => ({
      role: message.role,
      content: message.content,
      feedback: message.feedback,
      createdAt: new Date(message.createdAt).toISOString(),
    })),
  }));
}

export function getConversationForUser(id: string, userId: string) {
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .get();
}

export function createConversation(
  userId: string,
  model: string | null = null,
  temporary = false,
  providerId: string | null = null,
  modelMode: string | null = null,
) {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.insert(conversations)
    .values({
      id,
      userId,
      title: temporary ? "Temporary chat" : "New chat",
      model,
      providerId,
      modelMode,
      temporary,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { id, title: temporary ? "Temporary chat" : "New chat", model, temporary, updatedAt: now };
}

export function setConversationModel(id: string, model: string, providerId: string | null, modelMode: string | null) {
  db.update(conversations)
    .set({ model, providerId, modelMode })
    .where(eq(conversations.id, id))
    .run();
}

export function recordModelSelection(input: Omit<typeof modelSelections.$inferInsert, "id" | "createdAt">) {
  db.insert(modelSelections)
    .values({ ...input, createdAt: Date.now() })
    .run();
}

export function deleteConversation(id: string, userId: string) {
  const result = db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .run();
  return result.changes > 0;
}

export function listMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();
}

export function titleFromMessage(content: string) {
  const single = content.replace(/\s+/g, " ").trim();
  if (!single) return "New chat";
  return single.length > 72 ? `${single.slice(0, 72)}…` : single;
}

export function syncTranscript(
  conversationId: string,
  incoming: { id: string; role: "user" | "assistant"; content: string; hasFiles?: boolean }[],
  options: { replace?: boolean } = {},
) {
  const stored = db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();
  const incomingIds = new Set(incoming.map((message) => message.id));
  const sameThread =
    options.replace ||
    stored.length === 0 ||
    (stored[0] !== undefined && incomingIds.has(stored[0].id));
  const staleIds = sameThread
    ? stored.flatMap((message) => (incomingIds.has(message.id) ? [] : [message.id]))
    : [];

  db.transaction((tx) => {
    if (staleIds.length > 0) {
      tx.delete(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            inArray(messages.id, staleIds),
          ),
        )
        .run();
    }

    let createdAt = Date.now();
    for (const message of incoming) {
      const content = bounded(message.content).trim();
      if (!content && !message.hasFiles) continue;
      const existing = tx
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
        })
        .from(messages)
        .where(eq(messages.id, message.id))
        .get();
      if (existing) {
        if (existing.conversationId === conversationId) {
          tx.update(messages)
            .set({ content })
            .where(eq(messages.id, message.id))
            .run();
        }
        continue;
      }
      tx.insert(messages)
        .values({
          id: message.id,
          conversationId,
          role: message.role,
          content,
          createdAt,
        })
        .run();
      createdAt += 1;
    }

    tx.update(conversations)
      .set({ updatedAt: Date.now() })
      .where(eq(conversations.id, conversationId))
      .run();
  });
}

export function maybeSetTitle(
  conversationId: string,
  currentTitle: string,
  content: string,
) {
  if (currentTitle !== "New chat") return;
  const title = titleFromMessage(content);
  if (title === "New chat") return;
  db.update(conversations)
    .set({ title, updatedAt: Date.now() })
    .where(eq(conversations.id, conversationId))
    .run();
}

export function saveAssistantMessage(
  conversationId: string,
  message: { id: string; content: string; meta?: Record<string, unknown> },
) {
  const content = bounded(message.content).trim();
  if (!content) return;
  const meta = message.meta ? JSON.stringify(message.meta) : null;
  const latest = db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .get();
  const createdAt = Math.max(Date.now(), (latest?.createdAt ?? 0) + 1);
  db.insert(messages)
    .values({
      id: message.id || crypto.randomUUID(),
      conversationId,
      role: "assistant",
      content,
      meta,
      createdAt,
    })
    .onConflictDoUpdate({
      target: messages.id,
      set: { content, meta },
    })
    .run();
  db.update(conversations)
    .set({ updatedAt: createdAt })
    .where(eq(conversations.id, conversationId))
    .run();
}
