import { ChatShell } from "@/components/chat/chat-shell";
import { listConversations } from "@/lib/db/queries";
import { checkOllama, getModelName } from "@/lib/ollama";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [conversations, ollama] = await Promise.all([
    Promise.resolve(listConversations(user.id)),
    checkOllama(),
  ]);

  return (
    <ChatShell
      conversations={conversations}
      user={{ name: user.name, email: user.email }}
      model={getModelName()}
      ollamaMessage={ollama.ok ? null : ollama.error}
    >
      {children}
    </ChatShell>
  );
}
