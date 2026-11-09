import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelServiceAction } from "@/app/portal/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Button } from "@/components/ui/button";
import { CYCLE_LABEL, formatMoney, type Cycle } from "@/lib/billing/money";
import { getServiceForUser, invoicesForService, isOverdue } from "@/lib/billing/store";
import { requireCustomer } from "@/lib/customer";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Service" };

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomer(`/portal/services/${id}`);
  const service = getServiceForUser(id, user.id);
  if (!service) notFound();
  const invoices = invoicesForService(service.id);
  const canCancel = service.status !== "cancelled" && !service.cancelRequestedAt;

  return (
    <>
      <Link href="/portal/services" className="text-sm text-muted-foreground hover:text-foreground">
        ← All services
      </Link>
      <PageHeader title={service.name} description={service.label ?? undefined} actions={<StatusBadge status={service.status} />} />
      <dl className="grid gap-4 rounded-xl border bg-card p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Price</dt>
          <dd className="font-medium">
            {formatMoney(service.amountMinor, service.currency)} · {CYCLE_LABEL[service.cycle as Cycle] ?? service.cycle}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next due</dt>
          <dd className="font-medium">{service.nextDueAt ? formatDate(service.nextDueAt) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ordered</dt>
          <dd>{formatDate(service.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Active since</dt>
          <dd>{service.activatedAt ? formatDate(service.activatedAt) : "Awaiting payment"}</dd>
        </div>
        {service.kind === "ai" ? (
          <div>
            <dt className="text-muted-foreground">CONZEX AI allowance</dt>
            <dd>{service.aiQuotaTokens === null ? "Unlimited" : `${formatNumber(service.aiQuotaTokens)} tokens a month`}</dd>
          </div>
        ) : null}
      </dl>
      {service.status === "pending" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          This service starts once its first invoice is paid. Our team then sets it up and sends access details on a request.
        </p>
      ) : null}
      {service.cancelRequestedAt && service.status === "active" ? (
        <p className="mt-4 rounded-xl border p-4 text-sm">
          Cancellation requested on {formatDate(service.cancelRequestedAt)}. The service ends on{" "}
          {service.nextDueAt ? formatDate(service.nextDueAt) : "the end of its term"} and will not renew.
        </p>
      ) : null}

      <h2 className="mt-8 text-base">Invoices</h2>
      <ul className="mt-3 divide-y rounded-xl border bg-card">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="flex items-center justify-between gap-3 p-4">
            <Link href={`/portal/invoices/${invoice.id}`} className="font-medium hover:underline">
              {invoice.number}
            </Link>
            <span className="flex items-center gap-3 text-sm">
              <StatusBadge status={isOverdue(invoice) ? "overdue" : invoice.status} />
              {formatMoney(invoice.totalMinor, invoice.currency)}
            </span>
          </li>
        ))}
      </ul>

      {canCancel ? (
        <ActionForm
          action={cancelServiceAction}
          className="mt-8"
          confirm={{
            title: service.status === "pending" ? "Cancel this order?" : "Cancel this service?",
            description:
              service.status === "pending"
                ? "The unpaid invoice is cancelled and nothing is set up."
                : "It keeps running until the end of the paid term, then stops. It will not renew.",
            confirmLabel: service.status === "pending" ? "Cancel order" : "Request cancellation",
            destructive: true,
          }}
        >
          <input type="hidden" name="serviceId" value={service.id} />
          <Button type="submit" variant="outline" className="rounded-full text-destructive">
            {service.status === "pending" ? "Cancel order" : "Request cancellation"}
          </Button>
        </ActionForm>
      ) : null}
    </>
  );
}
