import Link from "next/link";
import { Empty, PageHeader, TableCard } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/billing/money";
import { isOverdue, listInvoicesForUser } from "@/lib/billing/store";
import { requireCustomer } from "@/lib/customer";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const user = await requireCustomer("/portal/invoices");
  const invoices = listInvoicesForUser(user.id);
  return (
    <>
      <PageHeader title="Invoices" description="View, print and pay your invoices." />
      <TableCard>
        {invoices.length === 0 ? (
          <Empty>No invoices yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Invoice</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="pl-4">
                    <Link href={`/portal/invoices/${invoice.id}`} className="font-medium hover:underline">
                      {invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(invoice.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(invoice.dueAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={isOverdue(invoice) ? "overdue" : invoice.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{formatMoney(invoice.totalMinor, invoice.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </>
  );
}
