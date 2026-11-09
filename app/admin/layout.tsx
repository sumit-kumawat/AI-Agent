import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Mark } from "@/components/brand";
import { ConzexCredit } from "@/components/conzex-credit";
import { requireAdmin } from "@/lib/admin";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: { default: "Admin", template: `%s · Admin · ${BRAND.product}` } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const linkClass =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b bg-card/60 print:hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Mark className="size-7 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{BRAND.product} admin</p>
            <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
          </div>
          <Link href="/chat" className="text-sm text-muted-foreground underline md:hidden">
            Chat
          </Link>
        </div>
        <div className="px-2 pb-2 md:flex-1">
          <AdminNav />
        </div>
        <div className="hidden space-y-1 border-t p-3 md:block">
          <Link href="/account/password?next=/admin" className={linkClass}>
            <KeyRound className="size-4" />
            Change password
          </Link>
          <Link href="/chat" className={linkClass}>
            <ArrowLeft className="size-4" />
            Back to chat
          </Link>
          <ConzexCredit className="px-3 pt-2" />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-8">{children}</div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-4 md:hidden">
          <Link href="/account/password?next=/admin" className="text-sm text-muted-foreground underline">
            Change password
          </Link>
          <ConzexCredit />
        </footer>
      </main>
    </div>
  );
}
