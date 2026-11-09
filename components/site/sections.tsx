import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CYCLE_SHORT, formatMoney, type Cycle } from "@/lib/billing/money";
import type { CatalogItem } from "@/lib/billing/store";
import { parseList } from "@/lib/site/pages";

export function Hero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b bg-gradient-to-b from-sidebar to-background">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl leading-tight text-balance sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{lead}</p>
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}

export function SectionTitle({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl sm:text-3xl">{title}</h2>
      {lead ? <p className="mt-2 text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

export function Features({ value, title }: { value?: string; title?: string }) {
  const items = parseList(value);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      {title ? <SectionTitle title={title} /> : null}
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${title ? "mt-8" : ""}`}>
        {items.map((item) => (
          <article key={item.title} className="rounded-2xl border bg-card p-5">
            <h3 className="text-base">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Steps({ value, title = "How it works" }: { value?: string; title?: string }) {
  const items = parseList(value);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <SectionTitle title={title} />
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => (
          <li key={item.title} className="rounded-2xl border bg-card p-5">
            <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary">
              {index + 1}
            </span>
            <h3 className="mt-3 text-base">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Faqs({ value, title = "Frequently asked questions" }: { value?: string; title?: string }) {
  const items = parseList(value);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-6 py-14">
      <SectionTitle title={title} />
      <div className="mt-6 divide-y rounded-2xl border bg-card">
        {items.map((item) => (
          <details key={item.title} className="group p-5">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="flex items-center justify-between gap-4">
                {item.title}
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Cta({ title, lead, href, label }: { title?: string; lead?: string; href: string; label: string }) {
  if (!title) return null;
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16">
      <div className="flex flex-col items-start gap-4 rounded-2xl border bg-sidebar p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl">{title}</h2>
          {lead ? <p className="mt-1 text-muted-foreground">{lead}</p> : null}
        </div>
        <Button asChild className="rounded-full">
          <Link href={href}>{label}</Link>
        </Button>
      </div>
    </section>
  );
}

function lowest(item: CatalogItem) {
  return [...item.prices].sort((a, b) => {
    if (a.cycle === "monthly") return -1;
    if (b.cycle === "monthly") return 1;
    return a.amountMinor - b.amountMinor;
  })[0]!;
}

export function Plans({
  title,
  lead,
  items,
  requestHref,
}: {
  title?: string;
  lead?: string;
  items: CatalogItem[];
  requestHref: string;
}) {
  return (
    <section id="plans" className="mx-auto max-w-6xl px-6 py-14">
      <SectionTitle title={title ?? "Plans"} lead={lead} />
      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed p-8 text-center">
          <p className="font-medium">Plans for this service are quoted on request.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us what you need and our team will send a proposal you can accept and pay online.
          </p>
          <Button asChild className="mt-4 rounded-full">
            <Link href={requestHref}>Request a quote</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-plans>
          {items.map((item) => {
            const price = lowest(item);
            return (
              <article
                key={item.id}
                className={`flex flex-col rounded-2xl border bg-card p-6 ${item.featured ? "ring-2 ring-brand" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg">{item.name}</h3>
                  {item.featured ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">Popular</span>
                  ) : null}
                </div>
                {item.tagline ? <p className="mt-1 text-sm text-muted-foreground">{item.tagline}</p> : null}
                <p className="mt-5">
                  <span className="text-3xl font-semibold">{formatMoney(price.amountMinor, price.currency)}</span>{" "}
                  <span className="text-sm text-muted-foreground">{CYCLE_SHORT[price.cycle as Cycle]}</span>
                </p>
                {price.setupMinor > 0 ? (
                  <p className="text-xs text-muted-foreground">+ {formatMoney(price.setupMinor, price.currency)} setup</p>
                ) : null}
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {item.features
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                        {line}
                      </li>
                    ))}
                </ul>
                <Button asChild className="mt-6 rounded-full">
                  <Link href={`/order/${item.slug}`}>Order {item.name}</Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
