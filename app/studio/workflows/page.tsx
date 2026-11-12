import { CreateWorkflowForm } from "@/components/studio/studio-client";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { listWorkflowsForUser } from "@/lib/creative/schedules";
import { detectEngines } from "@/lib/creative/engines";
import { studioModule } from "@/lib/creative/types";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Workflow Builder" };

export default async function WorkflowsPage() {
  const page = studioModule("workflows")!;
  const user = await requireUser();
  const engines = await detectEngines();
  const workflows = listWorkflowsForUser(user.id!);
  return (
    <StudioWorkspace title={page.title} description={page.description} engines={engines}>
      <p className="mb-4 text-sm text-muted-foreground">
        Save draft graphs now. React Flow execution and live runs are deferred.
      </p>
      <CreateWorkflowForm />
      {workflows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No workflows yet.</p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border">
          {workflows.map((workflow) => (
            <li key={workflow.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>{workflow.name}</span>
              <span className="text-muted-foreground">Draft</span>
            </li>
          ))}
        </ul>
      )}
    </StudioWorkspace>
  );
}
