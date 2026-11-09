import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProductAction } from "@/app/admin/billing-actions";
import { ActionForm } from "@/components/action-form";
import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { getProduct, pricesFor } from "@/lib/billing/store";

export const metadata = { title: "Edit plan" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();
  return (
    <>
      <Link href="/admin/billing/products" className="text-sm text-muted-foreground hover:text-foreground">
        ← All plans
      </Link>
      <PageHeader
        title={product.name}
        description="Price changes apply to new orders. Existing services keep the price they were ordered at."
        actions={
          <ActionForm
            action={deleteProductAction}
            confirm={{ title: `Delete ${product.name}?`, description: "Plans with customer services cannot be deleted; hide them instead.", confirmLabel: "Delete", destructive: true }}
          >
            <input type="hidden" name="id" value={product.id} />
            <Button type="submit" variant="outline" className="text-destructive">Delete</Button>
          </ActionForm>
        }
      />
      <ProductForm product={product} prices={pricesFor(product.id)} />
    </>
  );
}
