import { Bot, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Cta, Faqs, Hero, SectionTitle, Steps } from "@/components/site/sections";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { HOME, NAV_GROUPS, pagesIn } from "@/lib/site/pages";

export const metadata: Metadata = {
  title: { absolute: HOME.title },
  description: HOME.meta,
};

export default async function HomePage() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const groups = NAV_GROUPS.filter((group) => group.menu && group.id !== "solutions");

  return (
    <>
      <Hero eyebrow={HOME.eyebrow} title={HOME.heroTitle} lead={HOME.heroLead}>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            <Link href="/hosting/cloud">Explore hosting</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 rounded-full px-6">
            <Link href={signedIn ? "/chat" : "/ai"}>{signedIn ? "Open CONZEX AI" : "Meet CONZEX AI"}</Link>
          </Button>
        </div>
        <ul className="mt-8 grid max-w-2xl gap-2 text-sm sm:grid-cols-2">
          {HOME.highlights.map((item) => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </Hero>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <SectionTitle title={HOME.productsTitle} lead={HOME.productsLead} />
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="rounded-2xl border bg-card p-5">
              <h3 className="text-base">{group.label}</h3>
              <ul className="mt-3 space-y-1">
                {pagesIn(group.id).map((page) => (
                  <li key={page.slug}>
                    <Link href={page.path} className="block rounded-lg px-2 py-2 hover:bg-muted">
                      <span className="text-sm font-medium">{page.title}</span>
                      <span className="block text-xs text-muted-foreground">{page.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-sidebar">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-14 lg:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium tracking-wide text-primary uppercase">
              <Bot className="size-4" aria-hidden /> CONZEX AI
            </p>
            <h2 className="mt-3 text-2xl sm:text-3xl">A private AI assistant on the same account</h2>
            <p className="mt-3 text-muted-foreground">
              Write, code and research with an assistant that keeps your history and remembers only what you ask it
              to. Chats run on models hosted by CONZEX unless you choose a cloud model.
            </p>
            <Button asChild className="mt-6 rounded-full">
              <Link href={signedIn ? "/chat" : "/register"}>{signedIn ? "Open CONZEX AI" : "Create a free account"}</Link>
            </Button>
          </div>
          <div className="rounded-2xl border bg-background p-5 shadow-md">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm">
              Draft a migration plan for moving our WordPress site to a VPS.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Here is a four-step plan: take a full backup, provision the VPS, copy files and the database, then switch
              DNS once the new site checks out…
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pt-14">
        <SectionTitle title={HOME.solutionsTitle} lead={HOME.solutionsLead} />
        <div className="mt-6 flex flex-wrap gap-2">
          {pagesIn("solutions").map((page) => (
            <Button key={page.slug} asChild variant="outline" className="rounded-full">
              <Link href={page.path}>{page.title}</Link>
            </Button>
          ))}
        </div>
      </section>
      <Steps value={HOME.steps} />
      <Faqs value={HOME.faqs} />
      <Cta title={HOME.ctaTitle} lead={HOME.ctaLead} href="/portal/projects/new" label="Send a request" />
    </>
  );
}
