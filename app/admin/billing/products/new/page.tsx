import Link from "next/link";
import { ProductForm } from "@/components/admin/product-form";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "New plan" };

export default function NewProductPage() {
  return (
    <>
      <Link href="/admin/billing/products" className="text-sm text-muted-foreground hover:text-foreground">
        ← All plans
      </Link>
      <PageHeader title="New plan" description="New plans start hidden unless you choose to show them." />
      <ProductForm />
    </>
  );
}
