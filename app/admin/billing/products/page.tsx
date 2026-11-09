import Link from "next/link";
import { BillingTabs } from "@/components/admin/billing-nav";
import { Empty, PageHeader, TableCard } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CYCLE_SHORT, formatMoney, type Cycle } from "@/lib/billing/money";
import { listProducts, pricesFor } from "@/lib/billing/store";
import { PRODUCT_GROUPS } from "@/lib/site/pages";

export const metadata = { title: "Plans" };

export default function AdminProductsPage() {
  const products = listProducts();
  const groupTitle = (slug: string) => PRODUCT_GROUPS.find((group) => group.slug === slug)?.title ?? slug;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Plans shown on the website. A page without plans tells visitors that pricing is quoted on request."
        actions={
          <Button asChild>
            <Link href="/admin/billing/products/new">New plan</Link>
          </Button>
        }
      />
      <BillingTabs current="/admin/billing/products" />
      <TableCard>
        {products.length === 0 ? (
          <Empty>No plans yet. Create one to start taking orders.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Plan</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="pr-4">Website</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const cheapest = pricesFor(product.id).sort((a, b) => a.amountMinor - b.amountMinor);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="pl-4">
                      <Link href={`/admin/billing/products/${product.id}`} className="font-medium hover:underline">
                        {product.name}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{product.slug}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{groupTitle(product.groupSlug)}</TableCell>
                    <TableCell className="tabular-nums">
                      {cheapest.length
                        ? [...new Set(cheapest.map((price) => price.currency))]
                            .map((currency) => {
                              const row = cheapest.find((price) => price.currency === currency)!;
                              return `${formatMoney(row.amountMinor, currency)}${CYCLE_SHORT[row.cycle as Cycle]}`;
                            })
                            .join(" · ")
                        : "No prices"}
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground">{product.hidden ? "Hidden" : "Shown"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </>
  );
}
