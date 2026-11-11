import { handler, apiUser } from "@/lib/api";
import { linkReadingEnabled } from "@/lib/research/config";
import { searchUnavailableReason } from "@/lib/search/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the Search toggle can run for the signed-in user. */
export const GET = handler(async (request) => {
  await apiUser(request);
  if (!linkReadingEnabled()) {
    return Response.json({
      available: false,
      reason: "Search is turned off by an administrator.",
      provider: null,
    });
  }
  const reason = searchUnavailableReason();
  const provider = (process.env.SEARCH_PROVIDER ?? "").trim().toLowerCase() || null;
  return Response.json({
    available: reason === null,
    reason,
    provider: reason === null ? provider : null,
  });
});
