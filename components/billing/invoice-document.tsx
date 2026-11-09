import { Mark } from "@/components/brand";
import { StatusBadge } from "@/components/portal/status";
import type { BillingConfig } from "@/lib/billing/config";
import { formatMoney } from "@/lib/billing/money";
import { isOverdue, parseBillTo, type Invoice, type InvoiceItem, type Payment } from "@/lib/billing/store";
import { formatDate } from "@/lib/format";

/** The printable invoice. Shared by the portal and the admin panel. */
export function InvoiceDocument({
  invoice,
  items,
  payments,
  config,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
  config: BillingConfig;
}) {
  const billTo = parseBillTo(invoice.billTo);
  const address = [billTo.address1, billTo.address2, [billTo.city, billTo.state, billTo.postcode].filter(Boolean).join(", "), billTo.country]
    .filter(Boolean)
    .join("\n");
  const captured = payments.filter((payment) => payment.status === "captured");

  return (
    <article className="invoice-document rounded-2xl border bg-card p-6 sm:p-8" data-invoice={invoice.number}>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Mark className="size-7 text-brand" /> {config.companyName}
          </p>
          {config.companyAddress ? (
            <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{config.companyAddress}</p>
          ) : null}
          {config.companyTaxId ? <p className="text-sm text-muted-foreground">GSTIN {config.companyTaxId}</p> : null}
        </div>
        <div className="text-right">
          <h1 className="text-2xl">Invoice</h1>
          <p className="font-mono text-sm">{invoice.number}</p>
          <div className="mt-2">
            <StatusBadge status={isOverdue(invoice) ? "overdue" : invoice.status} />
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Billed to</p>
          <p className="mt-1 font-medium">{billTo.company || billTo.name}</p>
          {billTo.company ? <p>{billTo.name}</p> : null}
          <p>{billTo.email}</p>
          {address ? <p className="whitespace-pre-line text-muted-foreground">{address}</p> : null}
          {billTo.taxId ? <p className="text-muted-foreground">GSTIN / tax ID {billTo.taxId}</p> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:text-right">
          <dt className="text-muted-foreground">Issued</dt>
          <dd>{formatDate(invoice.createdAt)}</dd>
          <dt className="text-muted-foreground">Due</dt>
          <dd>{formatDate(invoice.dueAt)}</dd>
          {invoice.paidAt ? (
            <>
              <dt className="text-muted-foreground">Paid</dt>
              <dd>{formatDate(invoice.paidAt)}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-3">
                {item.description}
                {item.periodStart && item.periodEnd ? (
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
                  </span>
                ) : null}
              </td>
              <td className="py-3 text-right tabular-nums">{formatMoney(item.amountMinor, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="tabular-nums">
          <tr>
            <td className="pt-3 text-right text-muted-foreground">Subtotal</td>
            <td className="pt-3 text-right">{formatMoney(invoice.subtotalMinor, invoice.currency)}</td>
          </tr>
          {invoice.taxMinor > 0 ? (
            <tr>
              <td className="pt-1 text-right text-muted-foreground">
                {invoice.taxLabel} ({invoice.taxRate}%)
              </td>
              <td className="pt-1 text-right">{formatMoney(invoice.taxMinor, invoice.currency)}</td>
            </tr>
          ) : null}
          <tr className="text-base font-semibold">
            <td className="pt-2 text-right">Total</td>
            <td className="pt-2 text-right" data-invoice-total>
              {formatMoney(invoice.totalMinor, invoice.currency)}
            </td>
          </tr>
        </tfoot>
      </table>

      {captured.length ? (
        <div className="mt-8 text-sm">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Payments</p>
          <ul className="mt-2 space-y-1">
            {captured.map((payment) => (
              <li key={payment.id}>
                {formatDate(payment.updatedAt)} · {payment.gateway === "razorpay" ? "Razorpay" : "Recorded by CONZEX"}
                {payment.gatewayPaymentId ? ` · ${payment.gatewayPaymentId}` : ""}
                {payment.note ? ` · ${payment.note}` : ""} · {formatMoney(payment.amountMinor, payment.currency)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
