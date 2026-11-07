import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workbench } from "@/components/ide/workbench";
import { requireAdmin } from "@/lib/admin";
import { getWorkspace, touchWorkspace } from "@/lib/ide/workspaces";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const workspace = getWorkspace((await params).id);
  return { title: workspace ? `${workspace.name} · IDE` : "IDE" };
}

export default async function IdeWorkspace({ params }: Props) {
  const admin = await requireAdmin();
  const workspace = getWorkspace((await params).id);
  if (!workspace) notFound();
  touchWorkspace(workspace.id);
  return <Workbench workspace={{ id: workspace.id, name: workspace.name }} user={{ name: admin.name, email: admin.email }} />;
}
