import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/brand";
import { ConzexCredit } from "@/components/conzex-credit";
import { PortalNav } from "@/components/portal/portal-nav";
import { isAdmin } from "@/lib/admin";
import { requireCustomer } from "@/lib/customer";

export const metadata: Metadata = { title: { default: "Portal", template: "%s · CONZEX portal" } };
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b bg-sidebar print:hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Link href="/" className="flex items-center gap-2" aria-label="CONZEX home">
            <Mark className="size-7 text-brand" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">CONZEX portal</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="px-2 pb-2 md:flex-1">
          <PortalNav />
        </div>
        <div className="hidden space-y-1 border-t p-3 text-sm md:block">
          {isAdmin(user) ? (
            <Link href="/admin/billing" className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
              Admin
            </Link>
          ) : null}
          <Link href="/" className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            Website
          </Link>
          <ConzexCredit className="px-3 pt-2" />
        </div>
      </aside>
      <main id="main" className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
