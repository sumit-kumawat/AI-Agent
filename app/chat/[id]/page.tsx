import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { attachmentsByMessage } from "@/lib/attachments/store";
import { parseMeta, type ChatMessage } from "@/lib/chat-types";
import { getConversationForUser, listMessages } from "@/lib/db/queries";
import { autoModeOf } from "@/lib/model-ref";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const conversation = getConversationForUser(id, user.id!);
  if (!conversation) notFound();

  const files = attachmentsByMessage(conversation.id);
  const initialMessages: ChatMessage[] = listMessages(conversation.id).map((message) => {
    const meta = parseMeta(message.meta);
    // Prefer the attachments table (source of truth); fall back to meta saved on the message.
    const attached = files.get(message.id) ?? meta.attachments ?? [];
    return {
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
      metadata: {
        ...meta,
        createdAt: message.createdAt,
        feedback: message.feedback as 1 | -1 | null,
        ...(attached.length ? { attachments: attached } : {}),
      },
    };
  });

  return (
    <ChatPanel
      key={conversation.id}
      conversationId={conversation.id}
      title={conversation.title}
      conversationModel={conversation.model}
      conversationProvider={conversation.providerId}
      conversationMode={autoModeOf(`auto:${conversation.modelMode ?? ""}`)}
      conversationSearch={conversation.searchEnabled}
      conversationDeepThink={conversation.deepThink}
      pinned={conversation.pinnedAt !== null}
      archived={conversation.archivedAt !== null}
      temporary={conversation.temporary}
      initialMessages={initialMessages}
    />
  );
}
