import type { Metadata } from "next";
import type { UIMessage } from "ai";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { getConversationForUser, listMessages } from "@/lib/db/queries";
import { getModelName } from "@/lib/ollama";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const conversation = getConversationForUser(id, user.id);
  if (!conversation) notFound();

  const initialMessages: UIMessage[] = listMessages(conversation.id).map(
    (message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
    }),
  );

  return (
    <ChatPanel
      key={conversation.id}
      conversationId={conversation.id}
      title={conversation.title}
      model={getModelName()}
      initialMessages={initialMessages}
    />
  );
}
