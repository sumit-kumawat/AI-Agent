import Link from "next/link";
import { notFound } from "next/navigation";
import { placeOrderAction } from "@/app/portal/actions";
import { ActionForm } from "@/components/action-form";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBillingConfig } from "@/lib/billing/config";
import { CYCLE_LABEL, CYCLES, formatMoney, type Cycle } from "@/lib/billing/money";
import { getBillingProfile, getProductBySlug, pricesFor } from "@/lib/billing/store";
import { requireCustomer } from "@/lib/customer";
import { PAGES } from "@/lib/site/pages";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireCustomer(`/order/${slug}`);
  const product = getProductBySlug(slug);
  if (!product || product.hidden) notFound();
  const profile = getBillingProfile(user.id);
  const config = getBillingConfig();
  const prices = pricesFor(product.id)
    .filter((price) => price.currency === profile.currency)
    .sort((a, b) => CYCLES.indexOf(a.cycle as Cycle) - CYCLES.indexOf(b.cycle as Cycle));
  const page = PAGES.find((entry) => entry.productGroup === product.groupSlug);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {page ? (
          <Link href={page.path} className="text-sm text-muted-foreground hover:text-foreground">
            ← {page.title}
          </Link>
        ) : null}
        <h1 className="mt-2 text-3xl">Order {product.name}</h1>
        {product.tagline ? <p className="mt-1 text-muted-foreground">{product.tagline}</p> : null}

        {prices.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed p-6 text-sm">
            This plan is not offered in {profile.currency}. Change your billing currency under{" "}
            <Link href="/portal/billing" className="text-primary underline">
              Billing details
            </Link>
            , or send us a request.
          </div>
        ) : (
          <ActionForm action={placeOrderAction} className="mt-8 grid gap-5 rounded-2xl border bg-card p-6">
            <input type="hidden" name="productId" value={product.id} />
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Billing cycle</legend>
              {prices.map((price, index) => (
                <label key={price.cycle} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4 has-checked:border-brand has-checked:bg-accent">
                  <span className="flex items-center gap-3">
                    <input type="radio" name="cycle" value={price.cycle} defaultChecked={index === 0} className="accent-[var(--brand)]" />
                    {CYCLE_LABEL[price.cycle as Cycle]}
                  </span>
                  <span className="text-right">
                    <span className="font-semibold">{formatMoney(price.amountMinor, price.currency)}</span>
                    {price.setupMinor > 0 ? (
                      <span className="block text-xs text-muted-foreground">+ {formatMoney(price.setupMinor, price.currency)} setup</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
            {product.kind === "hosting" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="order-label">Domain or label (optional)</Label>
                <Input id="order-label" name="label" maxLength={120} placeholder="example.com" className="h-10" />
              </div>
            ) : (
              <input type="hidden" name="label" value="" />
            )}
            <p className="text-sm text-muted-foreground">
              An invoice is issued in {profile.currency}
              {config.taxRate > 0 ? ` with ${config.taxLabel} at ${config.taxRate}%` : ""}. The service starts once it is paid.
            </p>
            <div>
              <Button type="submit" className="rounded-full">Place order</Button>
            </div>
          </ActionForm>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
