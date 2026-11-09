import { setServiceStatusAction } from "@/app/admin/billing-actions";
import { ActionForm } from "@/components/action-form";
import { BillingTabs, StatusFilter } from "@/components/admin/billing-nav";
import { Empty, PageHeader, Pagination, pageParam, SearchForm, stringParam, TableCard } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CYCLE_SHORT, formatMoney, type Cycle } from "@/lib/billing/money";
import { adminServices } from "@/lib/billing/store";
import { PAGE_SIZE } from "@/lib/db/admin-queries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Services" };

function StatusButton({ id, status, label, destructive }: { id: string; status: string; label: string; destructive?: boolean }) {
  return (
    <ActionForm
      action={setServiceStatusAction}
      confirm={destructive ? { title: `${label} this service?`, confirmLabel: label, destructive: true } : undefined}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant="outline" className={destructive ? "text-destructive" : undefined}>
        {label}
      </Button>
    </ActionForm>
  );
}

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = stringParam(params.status);
  const q = stringParam(params.q);
  const page = pageParam(params.page);
  const { rows, total } = adminServices({ status, q, page, pageSize: PAGE_SIZE });

  return (
    <>
      <PageHeader title="Billing" description="Customer services. Suspending an AI plan returns the account to the free plan." />
      <BillingTabs current="/admin/billing/services" />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusFilter
          basePath="/admin/billing/services"
          current={status}
          q={q}
          options={[
            ["", "All"],
            ["pending", "Awaiting payment"],
            ["active", "Active"],
            ["cancel_requested", "Cancelling"],
            ["suspended", "Suspended"],
            ["cancelled", "Cancelled"],
          ]}
        />
        <SearchForm fields={[{ name: "q", placeholder: "Plan, label or email", value: q }]} hidden={status ? { status } : undefined} />
      </div>
      <TableCard>
        {rows.length === 0 ? (
          <Empty>No services match.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Service</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ service, email }) => (
                <TableRow key={service.id}>
                  <TableCell className="pl-4">
                    <p className="font-medium">{service.name}</p>
                    {service.label ? <p className="text-xs text-muted-foreground">{service.label}</p> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{email}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(service.amountMinor, service.currency)}
                    {CYCLE_SHORT[service.cycle as Cycle]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{service.nextDueAt ? formatDate(service.nextDueAt) : "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={service.status} />
                    {service.cancelRequestedAt && service.status === "active" ? (
                      <p className="mt-1 text-xs text-muted-foreground">Ends at term end</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-2">
                      {service.status === "active" ? <StatusButton id={service.id} status="suspended" label="Suspend" destructive /> : null}
                      {service.status === "suspended" || service.status === "pending" ? (
                        <StatusButton id={service.id} status="active" label="Activate" />
                      ) : null}
                      {service.status !== "cancelled" ? <StatusButton id={service.id} status="cancelled" label="Cancel" destructive /> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      <Pagination page={page} total={total} basePath="/admin/billing/services" params={{ status, q }} />
    </>
  );
}
