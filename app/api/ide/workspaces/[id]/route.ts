import { audit } from "@/lib/audit";
import { errorResponse, ideAdmin } from "@/lib/ide/guard";
import { closeTerminal, listTerminals } from "@/lib/ide/terminals";
import { deleteWorkspace } from "@/lib/ide/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await ideAdmin(request);
    const { id } = await params;
    for (const terminal of listTerminals(id, admin.id)) closeTerminal(terminal.id);
    const workspace = deleteWorkspace(id);
    audit(admin, "workspace.delete", { type: "workspace", id }, { name: workspace.name, folder: workspace.folder });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
