import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { attachmentsByMessage } from "@/lib/attachments/store";
import { parseMeta, type ChatMessage } from "@/lib/chat-types";
import { getConversationForUser, listMessages } from "@/lib/db/queries";
import { autoModeOf } from "@/lib/model-ref";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const conversation = getConversationForUser(id, user.id!);
  if (!conversation) notFound();

  const files = attachmentsByMessage(conversation.id);
  const initialMessages: ChatMessage[] = listMessages(conversation.id).map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text" as const, text: message.content }],
    metadata: {
      ...parseMeta(message.meta),
      createdAt: message.createdAt,
      feedback: message.feedback as 1 | -1 | null,
      ...(files.has(message.id) ? { attachments: files.get(message.id) } : {}),
    },
  }));

  return (
    <ChatPanel
      key={conversation.id}
      conversationId={conversation.id}
      title={conversation.title}
      conversationModel={conversation.model}
      conversationProvider={conversation.providerId}
      conversationMode={autoModeOf(`auto:${conversation.modelMode ?? ""}`)}
      pinned={conversation.pinnedAt !== null}
      archived={conversation.archivedAt !== null}
      temporary={conversation.temporary}
      initialMessages={initialMessages}
    />
  );
}
