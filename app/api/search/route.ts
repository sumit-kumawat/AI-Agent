import { apiUser, handler } from "@/lib/api";
import { searchConversations } from "@/lib/db/queries";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  const limited = rateLimit(`search:${user.id}`, 120, 60 * 1000);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
  return Response.json({ results: searchConversations(user.id, query) });
});
