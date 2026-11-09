import Link from "next/link";
import { Mark } from "@/components/brand";
import { ConzexCredit } from "@/components/conzex-credit";
import { CurrencySwitch } from "@/components/site/currency-switch";
import { NAV_GROUPS, pagesIn } from "@/lib/site/pages";
import { visitorCurrency } from "@/lib/site/currency";

export async function SiteFooter() {
  const currency = await visitorCurrency();
  return (
    <footer className="mt-auto border-t bg-sidebar">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-1">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Mark className="size-6 text-brand" />
            CONZEX
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Hosting, infrastructure and AI for growing businesses.</p>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.id}>
            <h2 className="text-sm font-semibold">{group.label}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {pagesIn(group.id).map((page) => (
                <li key={page.slug}>
                  <Link href={page.path} className="text-muted-foreground hover:text-foreground">
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} CONZEX</span>
          <CurrencySwitch value={currency} />
          <ConzexCredit className="text-sm" />
        </div>
      </div>
    </footer>
  );
}
