import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Mark } from "@/components/brand";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Harbor" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b bg-card/60 md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Mark className="size-7 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Harbor admin</p>
            <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
          </div>
          <Link href="/chat" className="text-sm text-muted-foreground underline md:hidden">
            Chat
          </Link>
        </div>
        <div className="px-2 pb-2 md:flex-1">
          <AdminNav />
        </div>
        <div className="hidden border-t p-3 md:block">
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to chat
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
