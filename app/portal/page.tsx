import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/billing/money";
import { isOverdue, listInvoicesForUser, listServicesForUser } from "@/lib/billing/store";
import { requireCustomer } from "@/lib/customer";
import { formatDate } from "@/lib/format";
import { listProjectsForUser, projectLabel } from "@/lib/projects";

export const metadata = { title: "Overview" };

export default async function PortalHome() {
  const user = await requireCustomer();
  const services = listServicesForUser(user.id);
  const invoices = listInvoicesForUser(user.id);
  const projects = listProjectsForUser(user.id);
  const unpaid = invoices.filter((invoice) => invoice.status === "unpaid");
  const open = projects.filter((project) => !["completed", "declined", "cancelled"].includes(project.status));

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Your CONZEX services, invoices and requests."
        actions={
          <Button asChild className="rounded-full">
            <Link href="/portal/projects/new">New request</Link>
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active services" value={services.filter((service) => service.status === "active").length} />
        <StatCard
          label="Unpaid invoices"
          value={unpaid.length}
          hint={unpaid.length ? unpaid.map((invoice) => formatMoney(invoice.totalMinor, invoice.currency)).join(" + ") : undefined}
        />
        <StatCard label="Open requests" value={open.length} />
      </div>

      {unpaid.length ? (
        <section className="mt-8">
          <h2 className="text-base">Awaiting payment</h2>
          <ul className="mt-3 divide-y rounded-xl border bg-card">
            {unpaid.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/portal/invoices/${invoice.id}`} className="font-medium hover:underline">
                    {invoice.number}
                  </Link>
                  <p className="text-sm text-muted-foreground">Due {formatDate(invoice.dueAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={isOverdue(invoice) ? "overdue" : "unpaid"} />
                  <span className="font-medium">{formatMoney(invoice.totalMinor, invoice.currency)}</span>
                  <Button asChild size="sm" className="rounded-full">
                    <Link href={`/portal/invoices/${invoice.id}`}>Pay</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-base">Services</h2>
          {services.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              No services yet. <Link href="/hosting/cloud" className="text-primary underline">Browse plans</Link>.
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded-xl border bg-card">
              {services.slice(0, 5).map((service) => (
                <li key={service.id} className="flex items-center justify-between gap-3 p-4">
                  <Link href={`/portal/services/${service.id}`} className="min-w-0 truncate font-medium hover:underline">
                    {service.name}
                    {service.label ? <span className="text-muted-foreground"> · {service.label}</span> : null}
                  </Link>
                  <StatusBadge status={service.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="text-base">Requests</h2>
          {projects.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Need something that is not a standard plan? <Link href="/portal/projects/new" className="text-primary underline">Send a request</Link>.
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded-xl border bg-card">
              {projects.slice(0, 5).map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 p-4">
                  <Link href={`/portal/projects/${project.id}`} className="min-w-0 truncate font-medium hover:underline">
                    {project.title}
                  </Link>
                  <StatusBadge status={project.status} label={projectLabel(project.status)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
