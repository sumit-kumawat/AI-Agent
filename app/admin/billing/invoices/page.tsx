import Link from "next/link";
import { BillingTabs, StatusFilter } from "@/components/admin/billing-nav";
import { Empty, PageHeader, Pagination, pageParam, SearchForm, stringParam, TableCard } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/billing/money";
import { adminInvoices, isOverdue } from "@/lib/billing/store";
import { PAGE_SIZE } from "@/lib/db/admin-queries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Invoices" };

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = stringParam(params.status);
  const q = stringParam(params.q);
  const page = pageParam(params.page);
  const { rows, total } = adminInvoices({ status, q, page, pageSize: PAGE_SIZE });

  return (
    <>
      <PageHeader title="Billing" description="Every invoice issued to customers." />
      <BillingTabs current="/admin/billing/invoices" />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusFilter
          basePath="/admin/billing/invoices"
          current={status}
          q={q}
          options={[
            ["", "All"],
            ["unpaid", "Unpaid"],
            ["overdue", "Overdue"],
            ["paid", "Paid"],
            ["cancelled", "Cancelled"],
          ]}
        />
        <SearchForm fields={[{ name: "q", placeholder: "Invoice number or email", value: q }]} hidden={status ? { status } : undefined} />
      </div>
      <TableCard>
        {rows.length === 0 ? (
          <Empty>No invoices match.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ invoice, email, name }) => (
                <TableRow key={invoice.id}>
                  <TableCell className="pl-4">
                    <Link href={`/admin/billing/invoices/${invoice.id}`} className="font-mono text-sm hover:underline">
                      {invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <p>{name}</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(invoice.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(invoice.dueAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(invoice.totalMinor, invoice.currency)}</TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={isOverdue(invoice) ? "overdue" : invoice.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      <Pagination page={page} total={total} basePath="/admin/billing/invoices" params={{ status, q }} />
    </>
  );
}
