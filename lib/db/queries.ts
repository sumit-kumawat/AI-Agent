import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { conversations, messages, users } from "./schema";

const MAX_STORED_CHARS = 200_000;

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: number;
};

function bounded(content: string) {
  return content.length > MAX_STORED_CHARS
    ? content.slice(0, MAX_STORED_CHARS)
    : content;
}

export function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).get();
}

export function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  const id = crypto.randomUUID();
  db.insert(users)
    .values({
      id,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: Date.now(),
    })
    .run();
  return { id, name: input.name, email: input.email };
}

export function listConversations(userId: string): ConversationListItem[] {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .all();
}

export function getConversationForUser(id: string, userId: string) {
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .get();
}

export function createConversation(userId: string, model: string | null = null) {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.insert(conversations)
    .values({
      id,
      userId,
      title: "New chat",
      model,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return { id, title: "New chat", model, updatedAt: now };
}

export function setConversationModel(id: string, model: string) {
  db.update(conversations)
    .set({ model })
    .where(eq(conversations.id, id))
    .run();
}

export function firstUserId() {
  return db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1)
    .get()?.id;
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
  incoming: { id: string; role: "user" | "assistant"; content: string }[],
) {
  const stored = db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();
  const incomingIds = new Set(incoming.map((message) => message.id));
  const sameThread =
    stored.length === 0 || (stored[0] !== undefined && incomingIds.has(stored[0].id));
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
      if (!content) continue;
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
  message: { id: string; content: string },
) {
  const content = bounded(message.content).trim();
  if (!content) return;
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
      createdAt,
    })
    .onConflictDoUpdate({
      target: messages.id,
      set: { content },
    })
    .run();
  db.update(conversations)
    .set({ updatedAt: createdAt })
    .where(eq(conversations.id, conversationId))
    .run();
}
