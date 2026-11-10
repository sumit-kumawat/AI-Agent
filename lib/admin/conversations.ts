import { inArray, sql } from "drizzle-orm";
import { pruneUserFiles } from "@/lib/attachments/store";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;

export type ConversationSummary = {
  id: string;
  title: string;
  userId: string;
  email: string;
  messages: number;
  attachments: number;
  attachmentBytes: number;
};

/** Metadata only: titles, owners and counts, never message text. */
export function conversationSummaries(ids: string[]): ConversationSummary[] {
  if (ids.length === 0) return [];
  return db.all<ConversationSummary>(sql`
    SELECT c.id, c.title, c.user_id AS userId, u.email,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messages,
      (SELECT COUNT(*) FROM attachments a WHERE a.conversation_id = c.id) AS attachments,
      (SELECT COALESCE(SUM(size), 0) FROM attachments a WHERE a.conversation_id = c.id) AS attachmentBytes
    FROM conversations c JOIN users u ON u.id = c.user_id
    WHERE c.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `);
}

/** Deletes conversations with their messages and attachments (rows and files). Usage records are kept. */
export function deleteConversationRows(ids: string[]) {
  const summaries = conversationSummaries(ids);
  if (summaries.length === 0) return { deleted: [] as ConversationSummary[] };
  db.delete(conversations).where(inArray(conversations.id, summaries.map((row) => row.id))).run();
  for (const owner of new Set(summaries.map((row) => row.userId))) pruneUserFiles(owner);
  return { deleted: summaries };
}

/** Chats the retention policy would remove: not updated for `days` and not pinned. */
export function retentionCandidates(days: number, now = Date.now()) {
  if (days <= 0) return { count: 0, ids: [] as string[] };
  const rows = db.all<{ id: string }>(sql`
    SELECT id FROM conversations WHERE pinned_at IS NULL AND updated_at < ${now - days * DAY}
  `);
  return { count: rows.length, ids: rows.map((row) => row.id) };
}

export const RETENTION_ACTOR = { id: "system", email: "retention policy" };

/** Applies the configured retention policy. Run hourly and when an admin saves the policy. */
export function applyRetention(now = Date.now()) {
  const days = getSettings().conversationRetentionDays;
  const { ids } = retentionCandidates(days, now);
  if (ids.length === 0) return 0;
  let removed = 0;
  for (let index = 0; index < ids.length; index += 200) {
    const { deleted } = deleteConversationRows(ids.slice(index, index + 200));
    removed += deleted.length;
    if (deleted.length) {
      audit(RETENTION_ACTOR, "conversation.retention_delete", { type: "conversation" }, {
        days,
        count: deleted.length,
        messages: deleted.reduce((sum, row) => sum + row.messages, 0),
        attachments: deleted.reduce((sum, row) => sum + row.attachments, 0),
      });
    }
  }
  return removed;
}

/** Full export of the given conversations: messages and attachment references (no file bytes). */
export function exportConversations(ids: string[]) {
  const summaries = conversationSummaries(ids);
  return summaries.map((summary) => {
    const meta = db.get<{ model: string | null; createdAt: number; updatedAt: number; temporary: number; pinnedAt: number | null }>(sql`
      SELECT model, created_at AS createdAt, updated_at AS updatedAt, temporary, pinned_at AS pinnedAt FROM conversations WHERE id = ${summary.id}
    `);
    const messages = db.all<{ id: string; role: string; content: string; flagged: number; createdAt: number }>(sql`
      SELECT id, role, content, flagged, created_at AS createdAt FROM messages WHERE conversation_id = ${summary.id} ORDER BY created_at, id
    `);
    const files = db.all<{ id: string; messageId: string | null; name: string; kind: string; mime: string; size: number; sha256: string }>(sql`
      SELECT id, message_id AS messageId, name, kind, mime, size, sha256 FROM attachments WHERE conversation_id = ${summary.id}
    `);
    return {
      id: summary.id,
      title: summary.title,
      owner: { id: summary.userId, email: summary.email },
      model: meta?.model ?? null,
      createdAt: meta ? new Date(meta.createdAt).toISOString() : null,
      updatedAt: meta ? new Date(meta.updatedAt).toISOString() : null,
      messages: messages.map((message) => ({ ...message, flagged: Boolean(message.flagged), createdAt: new Date(message.createdAt).toISOString() })),
      attachments: files,
    };
  });
}
