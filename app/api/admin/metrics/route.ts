import { adminAction } from "@/lib/admin";
import { asRange, businessMetrics, systemMetrics } from "@/lib/admin/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dashboard data for live updates. Admins only. */
export async function GET(request: Request) {
  try {
    await adminAction();
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 403 });
  }
  const range = asRange(new URL(request.url).searchParams.get("range"));
  const [system, business] = await Promise.all([systemMetrics(), Promise.resolve(businessMetrics(range))]);
  return Response.json({ system, business }, { headers: { "Cache-Control": "no-store" } });
}
