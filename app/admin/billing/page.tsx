import Link from "next/link";
import { runRenewalsAction } from "@/app/admin/billing-actions";
import { ActionForm } from "@/components/action-form";
import { BillingTabs } from "@/components/admin/billing-nav";
import { PageHeader, StatCard } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { razorpayPublic } from "@/lib/billing/config";
import { formatMoney } from "@/lib/billing/money";
import { billingOverview } from "@/lib/billing/store";
import { openProjectCount } from "@/lib/projects";

export const metadata = { title: "Billing" };

export default function BillingOverviewPage() {
  const overview = billingOverview();
  const razorpay = razorpayPublic();
  const money = (rows: { currency: string; total: number }[]) =>
    rows.length ? rows.map((row) => formatMoney(row.total, row.currency)).join(" · ") : formatMoney(0, "INR");

  return (
    <>
      <PageHeader
        title="Billing"
        description="Orders, invoices, renewals and payments. Renewal invoices are issued automatically every hour."
        actions={
          <ActionForm action={runRenewalsAction}>
            <Button type="submit" variant="outline">Run renewals now</Button>
          </ActionForm>
        }
      />
      <BillingTabs current="/admin/billing" />
      {!razorpay.hasSecret ? (
        <p className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Online payment is off until Razorpay keys are saved under{" "}
          <Link href="/admin/billing/settings" className="underline">
            Payments &amp; tax
          </Link>
          . Customers can still order; you can record bank transfers on each invoice.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Paid this month" value={<span className="text-2xl">{money(overview.revenue)}</span>} />
        <StatCard
          label="Outstanding"
          value={<span className="text-2xl">{money(overview.outstanding)}</span>}
          hint={`${overview.outstanding.reduce((sum, row) => sum + row.count, 0)} unpaid, ${overview.overdue} overdue`}
        />
        <StatCard label="Active services" value={overview.activeServices} hint={`${overview.pendingServices} awaiting payment`} />
        <StatCard label="Open requests" value={<Link href="/admin/projects" className="hover:underline">{openProjectCount()}</Link>} />
      </div>
    </>
  );
}
