import Link from "next/link";
import { Mark } from "@/components/brand";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const phases = [
  {
    step: "01",
    title: "Accounts",
    body: "Email and password sign-in, with each conversation stored against the signed-in user.",
  },
  {
    step: "02",
    title: "Streaming chat",
    body: "Messages stream from a local Ollama model. The default is qwen2.5-coder:14b, which is Apache-2.0.",
  },
  {
    step: "03",
    title: "History",
    body: "SQLite keeps the thread. Reload the page and the same conversation is still there.",
  },
];

const plans = [
  {
    name: "Local",
    price: "$0",
    detail: "What this project runs today",
    points: [
      "One machine",
      "Your Ollama model",
      "SQLite on disk",
      "Unlimited local chats",
    ],
    action: "available" as const,
  },
  {
    name: "Team",
    price: "$29",
    detail: "Placeholder · per seat / month",
    points: [
      "Shared workspaces",
      "Role-based access",
      "Usage dashboard",
      "Billing not connected",
    ],
    action: "later" as const,
  },
  {
    name: "Cloud",
    price: "Custom",
    detail: "Placeholder · hosted later",
    points: [
      "Managed hosting",
      "SSO",
      "Dedicated models",
      "Talk to us when it exists",
    ],
    action: "later" as const,
  },
];

export function HomePage({ signedIn }: { signedIn: boolean }) {
  const startHref = signedIn ? "/chat" : "/register";

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,oklch(0.9_0.045_175/0.55),transparent_68%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.3fr_0.7fr] lg:py-28">
            <div className="max-w-2xl">
              <p className="text-sm font-medium tracking-wide text-primary uppercase">
                Self-hosted agent platform
              </p>
              <h1 className="mt-4 font-heading text-5xl leading-[1.05] text-balance sm:text-6xl">
                A private chat that stays on your machine.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Harbor is the first slice of a product you can host yourself.
                Sign in, talk to a local model, and keep the thread in SQLite.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-10 px-4">
                  <Link href={startHref}>
                    {signedIn ? "Open chat" : "Create an account"}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-10 px-4">
                  <Link href="/#pricing">See pricing</Link>
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                This machine
              </p>
              <pre className="mt-4 overflow-x-auto font-mono text-sm leading-7">
                <span className="text-muted-foreground">model</span>
                {"  "}qwen2.5-coder:14b{"\n"}
                <span className="text-muted-foreground">host</span>
                {"   "}127.0.0.1:11434{"\n"}
                <span className="text-muted-foreground">store</span>
                {"  "}data/harbor.db
              </pre>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Swap the model with the <code>OLLAMA_MODEL</code> environment
                variable. A smaller build such as{" "}
                <code>qwen2.5-coder:7b</code> works the same way.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-20 md:grid-cols-3">
          {phases.map((phase) => (
            <article key={phase.step} className="border-t pt-5">
              <p className="font-mono text-xs text-primary">{phase.step}</p>
              <h2 className="mt-3 font-heading text-2xl">{phase.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {phase.body}
              </p>
            </article>
          ))}
        </section>

        <section id="pricing" className="border-t bg-card/60">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="font-heading text-4xl">Pricing</h2>
              <p className="mt-3 text-muted-foreground">
                Local use is free because it runs here. Team and Cloud are
                placeholders for a later hosted product. Nothing is billed.
              </p>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={
                    plan.action === "available" ? "ring-2 ring-primary" : undefined
                  }
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="font-heading text-2xl">
                        {plan.name}
                      </CardTitle>
                      {plan.action === "later" ? (
                        <Badge variant="outline">Placeholder</Badge>
                      ) : (
                        <Badge>Available</Badge>
                      )}
                    </div>
                    <CardDescription>{plan.detail}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="font-heading text-4xl">{plan.price}</p>
                    <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                      {plan.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {plan.action === "available" ? (
                      <Button asChild className="w-full">
                        <Link href={startHref}>
                          {signedIn ? "Open chat" : "Run it locally"}
                        </Link>
                      </Button>
                    ) : (
                      <Button className="w-full" variant="outline" disabled>
                        Coming later
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-6 text-sm text-muted-foreground">
          <Mark className="size-5 text-primary" />
          Harbor · local phase 1
        </div>
      </footer>
    </div>
  );
}
