import { headers } from "next/headers";
import { saveBillingSettings, saveRazorpayAction } from "@/app/admin/billing-actions";
import { ActionForm } from "@/components/action-form";
import { BillingTabs } from "@/components/admin/billing-nav";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getBillingConfig, razorpayPublic } from "@/lib/billing/config";
import { CURRENCIES } from "@/lib/billing/money";

export const metadata = { title: "Payments & tax" };

export default async function BillingSettingsPage() {
  const config = getBillingConfig();
  const razorpay = razorpayPublic();
  const host = (await headers()).get("host") ?? "your-domain";
  const webhookUrl = `${host.startsWith("localhost") ? "http" : "https"}://${host}/api/billing/razorpay/webhook`;

  return (
    <>
      <PageHeader title="Billing" description="How invoices look and how customers pay them." />
      <BillingTabs current="/admin/billing/settings" />

      <section className="mb-6 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base">Razorpay</h2>
          <span className="text-sm text-muted-foreground" data-razorpay-state={razorpay.hasSecret ? "ready" : "off"}>
            {razorpay.hasSecret && razorpay.keyId
              ? `Connected in ${razorpay.mode} mode`
              : "Not connected — invoices can only be paid offline"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Find the keys in the Razorpay Dashboard under Account &amp; Settings → API keys. Secrets are encrypted on this server and
          never shown again.
        </p>
        <ActionForm action={saveRazorpayAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Key ID
            <Input name="keyId" defaultValue={razorpay.keyId} placeholder="rzp_test_…" autoComplete="off" spellCheck={false} className="h-9 font-mono font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Key secret
            <Input
              name="secret"
              type="password"
              autoComplete="new-password"
              placeholder={razorpay.secretHint ? `Saved (${razorpay.secretHint}) — type to replace` : "Not set"}
              className="h-9 font-normal"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Webhook secret
            <Input
              name="webhookSecret"
              type="password"
              autoComplete="new-password"
              placeholder={razorpay.webhookSecretHint ? `Saved (${razorpay.webhookSecretHint}) — type to replace` : "Not set"}
              className="h-9 font-normal"
            />
          </label>
          <div className="text-sm text-muted-foreground md:col-span-3">
            Add a webhook in Razorpay pointing to <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{webhookUrl}</code> for the
            events <code className="font-mono text-xs">payment.captured</code>, <code className="font-mono text-xs">payment.failed</code> and{" "}
            <code className="font-mono text-xs">order.paid</code>, using the same webhook secret. Payments still apply without it, as long as
            the customer returns to the invoice.
          </div>
          <div className="md:col-span-3">
            <Button type="submit">Save Razorpay keys</Button>
          </div>
        </ActionForm>
        {razorpay.keyId || razorpay.hasSecret ? (
          <ActionForm
            action={saveRazorpayAction}
            className="mt-3"
            confirm={{ title: "Disconnect Razorpay?", description: "Customers can no longer pay invoices online.", confirmLabel: "Disconnect", destructive: true }}
          >
            <input type="hidden" name="clear" value="1" />
            <Button type="submit" variant="ghost" className="text-destructive">Disconnect</Button>
          </ActionForm>
        ) : null}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-base">Invoices and tax</h2>
        <ActionForm action={saveBillingSettings} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Company name
            <Input name="companyName" required defaultValue={config.companyName} className="h-9 font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Support email
            <Input name="supportEmail" type="email" defaultValue={config.supportEmail} className="h-9 font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
            Company address
            <Textarea name="companyAddress" rows={3} defaultValue={config.companyAddress} className="font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Tax registration (GSTIN)
            <Input name="companyTaxId" defaultValue={config.companyTaxId} className="h-9 font-mono font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Invoice number prefix
            <Input name="invoicePrefix" required defaultValue={config.invoicePrefix} className="h-9 font-mono font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Tax name
            <Input name="taxLabel" defaultValue={config.taxLabel} className="h-9 font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Tax rate (%)
            <Input name="taxRate" type="number" step="0.01" min={0} max={50} defaultValue={config.taxRate} className="h-9 font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Days to pay a new invoice
            <Input name="paymentTermsDays" type="number" min={0} max={60} defaultValue={config.paymentTermsDays} className="h-9 font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Issue renewal invoices this many days early
            <Input name="renewalLeadDays" type="number" min={0} max={60} defaultValue={config.renewalLeadDays} className="h-9 font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Default currency for new customers
            <select name="defaultCurrency" defaultValue={config.defaultCurrency} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal">
              {CURRENCIES.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <Button type="submit">Save billing settings</Button>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
