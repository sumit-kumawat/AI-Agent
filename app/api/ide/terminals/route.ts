import { audit } from "@/lib/audit";
import { HttpError, errorResponse, ideAdmin, readJson } from "@/lib/ide/guard";
import { createTerminal, listTerminals, publicTerminal } from "@/lib/ide/terminals";
import { openWorkspace } from "@/lib/ide/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await ideAdmin(request);
    const workspaceId = new URL(request.url).searchParams.get("workspace");
    if (!workspaceId) throw new HttpError("Send a workspace.", 400);
    return Response.json(
      { terminals: listTerminals(workspaceId, admin.id).map(publicTerminal) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await ideAdmin(request);
    const body = await readJson<{ workspace?: unknown; cols?: unknown; rows?: unknown }>(request);
    if (typeof body.workspace !== "string") throw new HttpError("Send a workspace.", 400);
    const { workspace, root } = openWorkspace(body.workspace);
    const session = createTerminal({
      workspaceId: workspace.id,
      userId: admin.id,
      root,
      cols: typeof body.cols === "number" ? body.cols : 80,
      rows: typeof body.rows === "number" ? body.rows : 24,
    });
    audit(admin, "terminal.open", { type: "workspace", id: workspace.id }, { terminal: session.id });
    return Response.json({ terminal: publicTerminal(session) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
