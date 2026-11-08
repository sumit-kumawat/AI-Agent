import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { parseMeta, type ChatMessage } from "@/lib/chat-types";
import { getConversationForUser, listMessages } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const conversation = getConversationForUser(id, user.id!);
  if (!conversation) notFound();

  const initialMessages: ChatMessage[] = listMessages(conversation.id).map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text" as const, text: message.content }],
    metadata: { ...parseMeta(message.meta), createdAt: message.createdAt, feedback: message.feedback as 1 | -1 | null },
  }));

  return (
    <ChatPanel
      key={conversation.id}
      conversationId={conversation.id}
      title={conversation.title}
      conversationModel={conversation.model}
      pinned={conversation.pinnedAt !== null}
      archived={conversation.archivedAt !== null}
      temporary={conversation.temporary}
      initialMessages={initialMessages}
    />
  );
}
