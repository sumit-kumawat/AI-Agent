import { apiUser, handler } from "@/lib/api";
import { sourceStatuses } from "@/lib/research/health";

export const runtime = "nodejs";

/** Whether Deep Research can run: at least one configured search source answered a test query. */
export const GET = handler(async (request) => {
  await apiUser(request);
  const sources = await sourceStatuses();
  const reachable = sources.filter((source) => source.ok);
  return Response.json({
    available: reachable.length > 0,
    sources: sources.map((source) => ({ name: source.name, ok: source.ok })),
    reason:
      sources.length === 0
        ? "No search source is configured. An admin can enable one under Admin → Research."
        : reachable.length === 0
          ? "None of the configured search sources is reachable right now."
          : null,
  });
});
