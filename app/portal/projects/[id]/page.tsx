import Link from "next/link";
import { notFound } from "next/navigation";
import { acceptProposalAction, cancelProject, declineProposalAction, postProjectMessage } from "@/app/portal/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/admin/ui";
import { ProjectTracker } from "@/components/portal/project-tracker";
import { StatusBadge } from "@/components/portal/status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/billing/money";
import { requireCustomer } from "@/lib/customer";
import { formatDateTime } from "@/lib/format";
import {
  BUDGETS,
  CLIENT_CANCELLABLE,
  CLOSED,
  getProjectForUser,
  PROJECT_TYPES,
  projectLabel,
  projectProposals,
  projectTimeline,
  TIMELINES,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/projects";

export const metadata = { title: "Request" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomer(`/portal/projects/${id}`);
  const project = getProjectForUser(id, user.id);
  if (!project) notFound();
  const timeline = projectTimeline(project.id, { includeInternal: false });
  const proposals = projectProposals(project.id);
  const closed = CLOSED.includes(project.status as ProjectStatus);

  return (
    <>
      <Link href="/portal/projects" className="text-sm text-muted-foreground hover:text-foreground">
        ← All requests
      </Link>
      <PageHeader
        title={project.title}
        description={`${project.reference} · ${PROJECT_TYPES[project.type as ProjectType] ?? project.type}`}
        actions={<StatusBadge status={project.status} label={projectLabel(project.status)} />}
      />
      <ProjectTracker status={project.status} />

      <section className="mt-6 rounded-xl border bg-card p-5 text-sm">
        <p className="whitespace-pre-wrap">{project.requirements}</p>
        <p className="mt-3 text-muted-foreground">
          Budget: {BUDGETS[project.budget as keyof typeof BUDGETS] ?? "Not specified"} · Timeline:{" "}
          {TIMELINES[project.timeline as keyof typeof TIMELINES] ?? "Not specified"}
        </p>
      </section>

      {proposals.length ? (
        <section className="mt-6">
          <h2 className="text-base">Proposals</h2>
          <ul className="mt-3 space-y-3">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="rounded-xl border bg-card p-5" data-proposal={proposal.status}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-lg font-semibold">{formatMoney(proposal.amountMinor, proposal.currency)}</span>
                  <StatusBadge status={proposal.status} />
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{proposal.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">Sent {formatDateTime(proposal.createdAt)}. Tax is added to the invoice where it applies.</p>
                {proposal.status === "sent" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionForm
                      action={acceptProposalAction}
                      confirm={{
                        title: "Accept this proposal?",
                        description: "An invoice is issued for it. Work is scheduled once the invoice is paid.",
                        confirmLabel: "Accept",
                      }}
                    >
                      <input type="hidden" name="proposalId" value={proposal.id} />
                      <Button type="submit" className="rounded-full">Accept proposal</Button>
                    </ActionForm>
                    <ActionForm action={declineProposalAction} confirm={{ title: "Decline this proposal?", confirmLabel: "Decline" }}>
                      <input type="hidden" name="proposalId" value={proposal.id} />
                      <Button type="submit" variant="outline" className="rounded-full">Decline</Button>
                    </ActionForm>
                  </div>
                ) : proposal.invoiceId ? (
                  <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
                    <Link href={`/portal/invoices/${proposal.invoiceId}`}>View invoice</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-base">Updates</h2>
        <ol className="mt-3 space-y-3">
          {timeline.map((entry) => (
            <li
              key={entry.id}
              className={`rounded-xl border p-4 text-sm ${entry.authorType === "client" ? "ml-8 bg-muted" : "mr-8 bg-card"}`}
            >
              <p className="text-xs text-muted-foreground">
                {entry.authorType === "client" ? "You" : entry.authorType === "staff" ? "CONZEX team" : "Update"} ·{" "}
                {formatDateTime(entry.createdAt)}
                {entry.status ? ` · ${projectLabel(entry.status)}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{entry.message}</p>
            </li>
          ))}
        </ol>
      </section>

      {!closed ? (
        <ActionForm action={postProjectMessage} resetOnSuccess className="mt-6 grid gap-3">
          <input type="hidden" name="projectId" value={project.id} />
          <label htmlFor="project-message" className="text-sm font-medium">
            Add a message
          </label>
          <Textarea id="project-message" name="message" rows={4} maxLength={5000} required />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="rounded-full">Send message</Button>
          </div>
        </ActionForm>
      ) : null}
      {CLIENT_CANCELLABLE.includes(project.status as ProjectStatus) ? (
        <ActionForm
          action={cancelProject}
          className="mt-4"
          confirm={{ title: "Cancel this request?", description: "Any open proposal is withdrawn.", confirmLabel: "Cancel request", destructive: true }}
        >
          <input type="hidden" name="projectId" value={project.id} />
          <Button type="submit" variant="ghost" className="rounded-full text-destructive">Cancel request</Button>
        </ActionForm>
      ) : null}
    </>
  );
}
