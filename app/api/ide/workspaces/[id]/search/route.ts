import { searchFiles } from "@/lib/ide/files";
import { errorResponse, ideUser } from "@/lib/ide/guard";
import { openWorkspace } from "@/lib/ide/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await ideUser(request);
    const { root } = openWorkspace(actor, (await params).id);
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").slice(0, 500);
    const result = searchFiles(root, query, {
      regex: url.searchParams.get("regex") === "1",
      caseSensitive: url.searchParams.get("case") === "1",
      include: url.searchParams.get("include") ?? undefined,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
