import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { isAdmin } from "@/lib/admin";
import { findUserById, listConversations, quotaState } from "@/lib/db/queries";
import { listSelectableModels, preferredModel } from "@/lib/providers/catalog";
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
  const catalog = await listSelectableModels();
  const quota = quotaState(user.id);
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <ChatShell
      conversations={listConversations(user.id)}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        publicId: user.publicId,
        username: user.username,
        createdAt: user.createdAt,
        usage: { used: quota?.used ?? 0, limit: quota?.limit ?? null },
      }}
      preferences={getPreferences(user.id)}
      models={catalog.models}
      defaultModel={preferredModel(catalog.models)?.key ?? null}
      admin={isAdmin(user)}
      ollamaMessage={catalog.warning}
      initialCollapsed={collapsed}
    >
      {children}
    </ChatShell>
  );
}
