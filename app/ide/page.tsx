import type { Metadata } from "next";
import { WorkspaceList } from "@/components/ide/workspace-list";
import { requireIdePage } from "@/lib/ide/guard";
import { workspacesRoot } from "@/lib/ide/paths";
import { ideStorageUsed, listWorkspaces } from "@/lib/ide/workspaces";

export const metadata: Metadata = { title: "IDE" };
export const dynamic = "force-dynamic";

export default async function IdeHome() {
  const user = await requireIdePage();
  const workspaces = listWorkspaces(user).map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    folder: workspace.folder,
    openedAt: workspace.openedAt ?? workspace.createdAt,
  }));
  return (
    <WorkspaceList
      workspaces={workspaces}
      root={user.admin ? workspacesRoot : null}
      admin={Boolean(user.admin)}
      storage={{ used: ideStorageUsed(user.id), limit: user.storageLimit }}
    />
  );
}
