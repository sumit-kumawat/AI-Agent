import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workbench } from "@/components/ide/workbench";
import { requireIdePage } from "@/lib/ide/guard";
import { touchWorkspace, workspaceFor } from "@/lib/ide/workspaces";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requireIdePage();
  const workspace = workspaceFor(user, (await params).id);
  return { title: workspace ? `${workspace.name} · IDE` : "IDE" };
}

export default async function IdeWorkspace({ params }: Props) {
  const user = await requireIdePage();
  const workspace = workspaceFor(user, (await params).id);
  if (!workspace) notFound();
  touchWorkspace(workspace.id);
  return (
    <Workbench
      workspace={{ id: workspace.id, name: workspace.name }}
      user={{ name: user.name, email: user.email }}
      admin={Boolean(user.admin)}
    />
  );
}
