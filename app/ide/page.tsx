import type { Metadata } from "next";
import { WorkspaceList } from "@/components/ide/workspace-list";
import { requireAdmin } from "@/lib/admin";
import { workspacesRoot } from "@/lib/ide/paths";
import { listWorkspaces } from "@/lib/ide/workspaces";

export const metadata: Metadata = { title: "IDE" };
export const dynamic = "force-dynamic";

export default async function IdeHome() {
  await requireAdmin();
  const workspaces = listWorkspaces().map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    folder: workspace.folder,
    openedAt: workspace.openedAt ?? workspace.createdAt,
  }));
  return <WorkspaceList workspaces={workspaces} root={workspacesRoot} />;
}
