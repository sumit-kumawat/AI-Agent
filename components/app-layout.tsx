import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";
import { isAdmin } from "@/lib/admin";
import { findUserById, listConversations } from "@/lib/db/queries";
import { accountSummary, modelsForUser } from "@/lib/plans/entitlements";
import { getPreferences } from "@/lib/preferences";
import { preferredModel } from "@/lib/providers/catalog";
import { requireUser } from "@/lib/session";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

/**
 * The signed-in application frame: fixed sidebar and header around every
 * user-facing section (chat, IDE, plans, usage). Each section's layout renders
 * this so no page can appear without it.
 */
export async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await requireUser();
  const user = findUserById(sessionUser.id!);
  if (!user) redirect("/login");
  const catalog = await modelsForUser(user);
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
      }}
      usage={accountSummary(user)}
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
