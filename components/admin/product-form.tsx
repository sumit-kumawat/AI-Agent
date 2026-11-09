import { saveProductAction } from "@/app/admin/billing-actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, CYCLE_LABEL, CYCLES, minorToInput } from "@/lib/billing/money";
import type { Product, ProductPrice } from "@/lib/billing/store";
import { PRODUCT_GROUPS } from "@/lib/site/pages";

export function ProductForm({ product, prices = [] }: { product?: Product; prices?: ProductPrice[] }) {
  const price = (currency: string, cycle: string) => prices.find((row) => row.currency === currency && row.cycle === cycle);
  return (
    <ActionForm action={saveProductAction} className="grid gap-6">
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <section className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="product-name">Name</Label>
          <Input id="product-name" name="name" required defaultValue={product?.name} maxLength={80} className="h-9" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-slug">URL slug</Label>
          <Input
            id="product-slug"
            name="slug"
            required
            defaultValue={product?.slug}
            pattern="[a-z0-9][a-z0-9\-]{1,60}"
            placeholder="cloud-start"
            className="h-9 font-mono"
          />
          <p className="text-xs text-muted-foreground">Customers order it at /order/slug.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-group">Website page</Label>
          <select
            id="product-group"
            name="groupSlug"
            defaultValue={product?.groupSlug ?? PRODUCT_GROUPS[0]?.slug}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {PRODUCT_GROUPS.map((group) => (
              <option key={group.slug} value={group.slug}>
                {group.title} ({group.path})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-sort">Order on the page</Label>
          <Input id="product-sort" name="sort" type="number" min={0} max={999} defaultValue={product?.sort ?? 0} className="h-9" />
        </div>
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="product-tagline">Tagline</Label>
          <Input id="product-tagline" name="tagline" defaultValue={product?.tagline} maxLength={160} className="h-9" />
        </div>
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="product-features">Features, one per line</Label>
          <Textarea id="product-features" name="features" rows={6} defaultValue={product?.features} maxLength={2000} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-quota">AI token quota per period</Label>
          <Input
            id="product-quota"
            name="aiQuotaTokens"
            inputMode="numeric"
            defaultValue={product?.aiQuotaTokens ?? ""}
            placeholder="Only for CONZEX AI plans"
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">Applies when the page is CONZEX AI. Blank means no limit.</p>
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="visible" defaultChecked={product ? !product.hidden : false} />
            Show on the website
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} />
            Highlight as most popular
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-base">Prices</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Leave a cycle blank to not offer it. Amounts exclude tax; tax is added on the invoice.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Cycle</th>
                {CURRENCIES.map((currency) => (
                  <th key={currency} className="py-2 pr-3 font-medium" colSpan={2}>
                    {currency} price / setup
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CYCLES.map((cycle) => (
                <tr key={cycle} className="border-t">
                  <td className="py-2 pr-3">{CYCLE_LABEL[cycle]}</td>
                  {CURRENCIES.map((currency) => (
                    <PriceCells key={currency} currency={currency} cycle={cycle} row={price(currency, cycle)} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div>
        <Button type="submit">{product ? "Save plan" : "Create plan"}</Button>
      </div>
    </ActionForm>
  );
}

function PriceCells({ currency, cycle, row }: { currency: string; cycle: string; row?: ProductPrice }) {
  return (
    <>
      <td className="py-2 pr-2">
        <Input
          name={`price.${currency}.${cycle}`}
          inputMode="decimal"
          aria-label={`${currency} ${cycle} price`}
          defaultValue={row ? minorToInput(row.amountMinor) : ""}
          className="h-8 w-28"
        />
      </td>
      <td className="py-2 pr-3">
        <Input
          name={`setup.${currency}.${cycle}`}
          inputMode="decimal"
          aria-label={`${currency} ${cycle} setup fee`}
          defaultValue={row && row.setupMinor ? minorToInput(row.setupMinor) : ""}
          className="h-8 w-24"
        />
      </td>
    </>
  );
}
