import { LifeBuoy, MessageSquare, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainSearch } from "@/components/site/domain-search";
import { Cta, Faqs, Features, Hero, Plans, Steps } from "@/components/site/sections";
import { Button } from "@/components/ui/button";
import { catalogGroup } from "@/lib/billing/store";
import { visitorCurrency } from "@/lib/site/currency";
import { pageByPath, type SitePage } from "@/lib/site/pages";

type Props = { params: Promise<{ path: string[] }> };

async function load(params: Props["params"]) {
  const { path } = await params;
  return pageByPath(`/${path.join("/")}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load(params);
  if (!page) return {};
  return { title: page.title, description: page.meta, alternates: { canonical: page.path } };
}

function requestHref(page: SitePage) {
  const search = new URLSearchParams();
  if (page.projectType) search.set("type", page.projectType);
  return `/portal/projects/new${search.size ? `?${search}` : ""}`;
}

export default async function SitePageRoute({ params }: Props) {
  const page = await load(params);
  if (!page) notFound();

  if (page.layout === "domains") {
    return (
      <>
        <Hero eyebrow={page.eyebrow} title={page.heroTitle} lead={page.heroLead}>
          <DomainSearch action={page.domainAction ?? "register"} />
        </Hero>
        <Steps value={page.steps} title="How a transfer works" />
        <Features value={page.features} />
        <Faqs value={page.faqs} />
        <Cta
          title={page.ctaTitle}
          lead={page.ctaLead}
          href={page.domainAction === "transfer" ? requestHref(page) : "/domains/transfer"}
          label={page.domainAction === "transfer" ? "Send a request" : "Transfer a domain"}
        />
      </>
    );
  }

  if (page.layout === "support") {
    const cards = [
      { icon: MessageSquare, title: "Send a request", text: "Ask a question or describe a problem. Replies appear on the request in your portal.", href: "/portal/projects/new?type=other", label: "New request" },
      { icon: ReceiptText, title: "Billing and invoices", text: "View, print and pay invoices, and update your billing details.", href: "/portal/invoices", label: "Open invoices" },
      { icon: LifeBuoy, title: "Common questions", text: "Accounts, billing, hosting and domains.", href: "/faq", label: "Read the FAQs" },
    ];
    return (
      <>
        <Hero eyebrow={page.eyebrow} title={page.heroTitle} lead={page.heroLead} />
        <section className="mx-auto grid max-w-6xl gap-4 px-6 py-14 md:grid-cols-3">
          {cards.map(({ icon: Icon, ...card }) => (
            <article key={card.title} className="flex flex-col rounded-2xl border bg-card p-6">
              <Icon className="size-5 text-brand" aria-hidden />
              <h2 className="mt-3 text-lg">{card.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{card.text}</p>
              <Button asChild variant="outline" className="mt-4 self-start rounded-full">
                <Link href={card.href}>{card.label}</Link>
              </Button>
            </article>
          ))}
        </section>
      </>
    );
  }

  const items = page.productGroup ? catalogGroup(page.productGroup, await visitorCurrency()) : [];

  return (
    <>
      <Hero eyebrow={page.eyebrow} title={page.heroTitle} lead={page.heroLead}>
        {page.layout === "product" ? (
          <Button asChild className="rounded-full">
            <Link href="#plans">See plans</Link>
          </Button>
        ) : page.layout === "solution" ? (
          <Button asChild className="rounded-full">
            <Link href={requestHref(page)}>Start a request</Link>
          </Button>
        ) : page.layout === "ai" ? (
          <Button asChild className="rounded-full">
            <Link href="/chat">Open CONZEX AI</Link>
          </Button>
        ) : null}
      </Hero>
      {page.body ? (
        <section className="mx-auto max-w-3xl space-y-4 px-6 pt-14 text-base leading-relaxed text-muted-foreground">
          {page.body.split("\n\n").map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </section>
      ) : null}
      <Features value={page.features} />
      {page.layout === "product" || (page.layout === "ai" && items.length > 0) ? (
        <Plans title={page.productsTitle} lead={page.productsLead} items={items} requestHref={requestHref(page)} />
      ) : null}
      <Steps value={page.steps} />
      <Faqs value={page.faqs} />
      <Cta
        title={page.ctaTitle}
        lead={page.ctaLead}
        href={page.layout === "ai" ? "/register" : requestHref(page)}
        label={page.layout === "ai" ? "Create an account" : "Send a request"}
      />
    </>
  );
}
