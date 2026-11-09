import Link from "next/link";
import { notFound } from "next/navigation";
import { sendProposalAction, staffProjectUpdate } from "@/app/admin/billing-actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/admin/ui";
import { ProjectTracker } from "@/components/portal/project-tracker";
import { StatusBadge } from "@/components/portal/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getBillingConfig } from "@/lib/billing/config";
import { CURRENCIES, formatMoney } from "@/lib/billing/money";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { formatDateTime } from "@/lib/format";
import {
  BUDGETS,
  CLOSED,
  getProject,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  projectLabel,
  projectProposals,
  projectTimeline,
  TIMELINES,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/projects";

export const metadata = { title: "Request" };

const select = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  const customer = db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, project.userId)).get();
  const timeline = projectTimeline(project.id, { includeInternal: true });
  const proposals = projectProposals(project.id);
  const closed = CLOSED.includes(project.status as ProjectStatus);

  return (
    <>
      <Link href="/admin/projects" className="text-sm text-muted-foreground hover:text-foreground">
        ← All requests
      </Link>
      <PageHeader
        title={project.title}
        description={`${project.reference} · ${PROJECT_TYPES[project.type as ProjectType] ?? project.type} · ${customer?.name ?? "Deleted user"} (${customer?.email ?? "—"})`}
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
          <ul className="mt-3 space-y-2">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
                <span>
                  <span className="font-semibold">{formatMoney(proposal.amountMinor, proposal.currency)}</span> · {proposal.summary.slice(0, 120)}
                </span>
                <span className="flex items-center gap-2">
                  {proposal.invoiceId ? (
                    <Link href={`/admin/billing/invoices/${proposal.invoiceId}`} className="text-primary underline">
                      Invoice
                    </Link>
                  ) : null}
                  <StatusBadge status={proposal.status} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-base">Timeline</h2>
        <ol className="mt-3 space-y-3">
          {timeline.map((entry) => (
            <li
              key={entry.id}
              className={`rounded-xl border p-4 text-sm ${
                !entry.visibleToClient ? "border-dashed bg-amber-500/5" : entry.authorType === "client" ? "bg-muted" : "bg-card"
              }`}
            >
              <p className="text-xs text-muted-foreground">
                {entry.authorType === "system" ? "System" : (entry.authorName ?? entry.authorType)} · {formatDateTime(entry.createdAt)}
                {entry.status ? ` · ${projectLabel(entry.status)}` : ""}
                {!entry.visibleToClient ? " · Internal note" : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{entry.message}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <ActionForm action={staffProjectUpdate} resetOnSuccess className="grid content-start gap-3 rounded-xl border bg-card p-5">
          <h2 className="text-base">Reply or update status</h2>
          <input type="hidden" name="projectId" value={project.id} />
          <Textarea name="message" rows={4} maxLength={5000} aria-label="Message" placeholder="Message to the customer" />
          <div className="flex flex-wrap items-center gap-3">
            <select name="status" defaultValue="" aria-label="New status" className={select}>
              <option value="">Keep status</option>
              {Object.entries(PROJECT_STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="internal" /> Internal note (customer cannot see it)
            </label>
          </div>
          <div>
            <Button type="submit">Save</Button>
          </div>
        </ActionForm>

        {!closed ? (
          <ActionForm
            action={sendProposalAction}
            resetOnSuccess
            confirm={{ title: "Send this proposal?", description: "Any earlier open proposal is withdrawn.", confirmLabel: "Send" }}
            className="grid content-start gap-3 rounded-xl border bg-card p-5"
          >
            <h2 className="text-base">Send a proposal</h2>
            <input type="hidden" name="projectId" value={project.id} />
            <Textarea name="summary" rows={4} required minLength={5} maxLength={5000} aria-label="Scope" placeholder="Scope, deliverables and terms" />
            <div className="flex gap-2">
              <select name="currency" defaultValue={getBillingConfig().defaultCurrency} aria-label="Currency" className={select}>
                {CURRENCIES.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
              <Input name="amount" required inputMode="decimal" aria-label="Amount before tax" placeholder="Amount before tax" className="h-9" />
            </div>
            <div>
              <Button type="submit">Send proposal</Button>
            </div>
          </ActionForm>
        ) : null}
      </section>
    </>
  );
}
