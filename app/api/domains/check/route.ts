import { candidates, checkDomain } from "@/lib/domains";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`domains:${ip ?? "direct"}`, 20, 60_000, { endpoint: "/api/domains/check", ip });
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 120) ?? "";
  const names = candidates(query);
  if (names.length === 0) {
    return Response.json({ error: "Enter a name like mybusiness or mybusiness.in." }, { status: 400 });
  }
  return Response.json({ results: await Promise.all(names.map(checkDomain)) });
}
