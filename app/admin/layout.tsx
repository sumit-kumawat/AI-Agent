import type { Metadata } from "next";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AppLayout } from "@/components/app-layout";
import { requireAdmin } from "@/lib/admin";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: { default: "Admin", template: `%s · Admin · ${BRAND.product}` } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <AppLayout>
      <AdminFrame>{children}</AdminFrame>
    </AppLayout>
  );
}
