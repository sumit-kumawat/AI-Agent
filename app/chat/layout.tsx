import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";
import { isAdmin } from "@/lib/admin";
import { findUserById, listConversations, quotaState } from "@/lib/db/queries";
import { checkOllama, getUserInventory, resolveModel } from "@/lib/ollama";
import { getPreferences } from "@/lib/preferences";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await requireUser();
  const user = findUserById(sessionUser.id!);
  if (!user) redirect("/login");
  const [inventory, ollama] = await Promise.all([getUserInventory(), checkOllama()]);
  const models = inventory.ok
    ? inventory.models.map(({ name, parameterSize, size }) => ({ name, parameterSize, size }))
    : [];
  const quota = quotaState(user.id);

  return (
    <ChatShell
      conversations={listConversations(user.id)}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        usage: { used: quota?.used ?? 0, limit: quota?.limit ?? null },
      }}
      preferences={getPreferences(user.id)}
      models={models}
      defaultModel={inventory.ok ? resolveModel(inventory.models) : null}
      admin={isAdmin(user)}
      ollamaMessage={ollama.ok ? null : ollama.error}
    >
      {children}
    </ChatShell>
  );
}
