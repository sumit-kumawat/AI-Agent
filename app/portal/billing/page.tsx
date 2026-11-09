import { saveBillingDetails } from "@/app/portal/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBillingProfile } from "@/lib/billing/store";
import { requireCustomer } from "@/lib/customer";

export const metadata = { title: "Billing details" };

const COUNTRIES = [
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["AE", "United Arab Emirates"],
  ["SG", "Singapore"],
  ["AU", "Australia"],
  ["CA", "Canada"],
  ["DE", "Germany"],
  ["NL", "Netherlands"],
  ["FR", "France"],
] as const;

export default async function BillingDetailsPage() {
  const user = await requireCustomer("/portal/billing");
  const profile = getBillingProfile(user.id);
  const field = (name: keyof typeof profile, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`billing-${name}`}>{label}</Label>
      <Input id={`billing-${name}`} name={name} defaultValue={profile[name] ?? ""} className="h-10" {...props} />
    </div>
  );

  return (
    <>
      <PageHeader title="Billing details" description="Shown on new invoices. Invoices already issued keep the details they were issued with." />
      <ActionForm action={saveBillingDetails} className="grid max-w-2xl gap-4 rounded-xl border bg-card p-5">
        <p className="text-sm">
          <span className="font-medium">{user.name}</span> <span className="text-muted-foreground">· {user.email}</span>
        </p>
        {field("company", "Company (optional)", { maxLength: 120, autoComplete: "organization" })}
        {field("address1", "Address", { maxLength: 200, autoComplete: "address-line1" })}
        {field("address2", "Address line 2 (optional)", { maxLength: 200, autoComplete: "address-line2" })}
        <div className="grid gap-4 sm:grid-cols-3">
          {field("city", "City", { maxLength: 80, autoComplete: "address-level2" })}
          {field("state", "State", { maxLength: 80, autoComplete: "address-level1" })}
          {field("postcode", "PIN / postcode", { maxLength: 20, autoComplete: "postal-code" })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="billing-country">Country</Label>
            <select
              id="billing-country"
              name="country"
              defaultValue={profile.country ?? "IN"}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {field("phone", "Phone (optional)", { maxLength: 25, autoComplete: "tel", inputMode: "tel" })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("taxId", "GSTIN or tax ID (optional)", { maxLength: 20, spellCheck: false, autoCapitalize: "characters" })}
          <div className="grid gap-1.5">
            <Label htmlFor="billing-currency">Billing currency</Label>
            <select
              id="billing-currency"
              name="currency"
              defaultValue={profile.currency}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
        </div>
        <div>
          <Button type="submit" className="rounded-full">Save details</Button>
        </div>
      </ActionForm>
    </>
  );
}
