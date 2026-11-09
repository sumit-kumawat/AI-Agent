import Link from "next/link";

const TABS = [
  ["/admin/billing", "Overview"],
  ["/admin/billing/invoices", "Invoices"],
  ["/admin/billing/services", "Services"],
  ["/admin/billing/products", "Plans"],
  ["/admin/billing/settings", "Payments & tax"],
] as const;

/** Status filter chips that keep the search query. */
export function StatusFilter({
  basePath,
  current,
  q,
  options,
}: {
  basePath: string;
  current: string;
  q: string;
  options: [value: string, label: string][];
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
      {options.map(([value, label]) => {
        const search = new URLSearchParams();
        if (value) search.set("status", value);
        if (q) search.set("q", q);
        const query = search.toString();
        return (
          <Link
            key={value || "all"}
            href={query ? `${basePath}?${query}` : basePath}
            aria-current={current === value ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-xs ${
              current === value ? "border-brand bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function BillingTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Billing" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={current === href ? "page" : undefined}
          className={`shrink-0 border-b-2 px-3 py-2 text-sm ${
            current === href ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
