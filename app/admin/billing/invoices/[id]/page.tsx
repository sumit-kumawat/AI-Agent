import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelInvoiceAction, markInvoicePaid } from "@/app/admin/billing-actions";
import { ActionForm } from "@/components/action-form";
import { InvoiceDocument } from "@/components/billing/invoice-document";
import { PrintButton } from "@/components/billing/print-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBillingConfig } from "@/lib/billing/config";
import { formatMoney } from "@/lib/billing/money";
import { getInvoice } from "@/lib/billing/store";

export const metadata = { title: "Invoice" };

export default async function AdminInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = getInvoice(id);
  if (!found) notFound();
  const { invoice } = found;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/billing/invoices" className="text-sm text-muted-foreground hover:text-foreground">
          ← All invoices
        </Link>
        <PrintButton />
      </div>
      {invoice.status === "unpaid" ? (
        <div className="mb-6 grid gap-4 rounded-xl border bg-card p-5 print:hidden md:grid-cols-[1fr_auto]">
          <ActionForm
            action={markInvoicePaid}
            confirm={{
              title: `Record ${formatMoney(invoice.totalMinor, invoice.currency)} as received?`,
              description: "Only do this once the money is in the bank. What the invoice pays for is activated.",
              confirmLabel: "Mark paid",
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="id" value={invoice.id} />
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="paid-note">Payment received offline</Label>
              <Input id="paid-note" name="note" required minLength={3} maxLength={200} placeholder="Bank transfer reference" className="h-9" />
            </div>
            <Button type="submit" className="h-9">Mark paid</Button>
          </ActionForm>
          <ActionForm
            action={cancelInvoiceAction}
            confirm={{
              title: `Cancel invoice ${invoice.number}?`,
              description: "Services waiting on it are cancelled and a proposal it was issued for is withdrawn.",
              confirmLabel: "Cancel invoice",
              destructive: true,
            }}
            className="self-end"
          >
            <input type="hidden" name="id" value={invoice.id} />
            <Button type="submit" variant="outline" className="h-9 text-destructive">Cancel invoice</Button>
          </ActionForm>
        </div>
      ) : null}
      <InvoiceDocument {...found} config={getBillingConfig()} />
    </>
  );
}
