import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/billing/invoice-document";
import { PayButton } from "@/components/billing/pay-button";
import { PrintButton } from "@/components/billing/print-button";
import { getBillingConfig } from "@/lib/billing/config";
import { formatMoney } from "@/lib/billing/money";
import { razorpayReady } from "@/lib/billing/razorpay";
import { getInvoiceForUser } from "@/lib/billing/store";
import { requireCustomer } from "@/lib/customer";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomer(`/portal/invoices/${id}`);
  const found = getInvoiceForUser(id, user.id);
  if (!found) notFound();
  const config = getBillingConfig();
  const { invoice } = found;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/portal/invoices" className="text-sm text-muted-foreground hover:text-foreground">
          ← All invoices
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {invoice.status === "unpaid" && razorpayReady() ? (
            <PayButton invoiceId={invoice.id} label={`Pay ${formatMoney(invoice.totalMinor, invoice.currency)}`} />
          ) : null}
        </div>
      </div>
      {invoice.status === "unpaid" && !razorpayReady() ? (
        <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm print:hidden" data-payment-unavailable>
          Online payment is not set up yet. {config.supportEmail ? `Email ${config.supportEmail}` : "Send us a request"} to pay
          by bank transfer, and we will mark the invoice paid.
        </p>
      ) : null}
      <InvoiceDocument {...found} config={config} />
    </>
  );
}
