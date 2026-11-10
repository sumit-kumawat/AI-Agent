import { apiUser, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { exportUserConversations } from "@/lib/db/queries";
import { listMemories } from "@/lib/memory";
import { getPreferences } from "@/lib/preferences";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** A JSON download of everything the signed-in user owns. */
export const GET = handler(async (request) => {
  const user = await apiUser(request);
  const limited = rateLimit(`account:export:${user.id}`, 5, 60 * 60 * 1000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);
  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      createdAt: new Date(user.createdAt).toISOString(),
    },
    preferences: getPreferences(user.id),
    memories: listMemories(user.id).map((memory) => ({
      content: memory.content,
      createdAt: new Date(memory.createdAt).toISOString(),
    })),
    conversations: exportUserConversations(user.id),
  };
  audit(user, "account.export", { type: "user", id: user.id }, { conversations: data.conversations.length });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="xai-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
