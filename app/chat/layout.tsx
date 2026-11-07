import { ChatShell } from "@/components/chat/chat-shell";
import { isAdmin } from "@/lib/admin";
import { listConversations } from "@/lib/db/queries";
import { checkOllama, getUserInventory, resolveModel } from "@/lib/ollama";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [inventory, ollama] = await Promise.all([getUserInventory(), checkOllama()]);
  const models = inventory.ok
    ? inventory.models.map(({ name, parameterSize, size }) => ({ name, parameterSize, size }))
    : [];

  return (
    <ChatShell
      conversations={listConversations(user.id)}
      user={{ name: user.name, email: user.email }}
      models={models}
      defaultModel={inventory.ok ? resolveModel(inventory.models) : null}
      admin={isAdmin(user)}
      ollamaMessage={ollama.ok ? null : ollama.error}
    >
      {children}
    </ChatShell>
  );
}
