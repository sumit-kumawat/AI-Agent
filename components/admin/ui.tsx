import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAGE_SIZE } from "@/lib/db/admin-queries";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Section({ title, description, children, actions }: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-medium">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-heading text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A card wrapper that lets wide tables scroll sideways on small screens. */
export function TableCard({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border bg-card">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Plain GET form so search works server-side, even without JavaScript. */
export function SearchForm({
  fields,
  hidden,
}: {
  fields: { name: string; placeholder: string; value: string }[];
  hidden?: Record<string, string>;
}) {
  return (
    <form className="flex flex-col gap-2 sm:flex-row" method="get">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field) => (
        <Input
          key={field.name}
          name={field.name}
          defaultValue={field.value}
          placeholder={field.placeholder}
          aria-label={field.placeholder}
          className="h-9 sm:w-64"
          autoCapitalize="none"
          spellCheck={false}
        />
      ))}
      <Button type="submit" className="h-9">Search</Button>
    </form>
  );
}

export function Pagination({
  page,
  total,
  basePath,
  params,
  pageKey = "page",
  hash = "",
}: {
  page: number;
  total: number;
  basePath: string;
  params: Record<string, string>;
  pageKey?: string;
  hash?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total === 0) return null;
  const href = (target: number) => {
    const search = new URLSearchParams({ ...params, [pageKey]: String(target) });
    for (const [key, value] of [...search]) if (!value) search.delete(key);
    return `${basePath}?${search}${hash}`;
  };
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Previous</Button>
        )}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>Next</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Next</Button>
        )}
      </div>
    </div>
  );
}

export function pageParam(value: string | string[] | undefined) {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function stringParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 200) ?? "";
}
