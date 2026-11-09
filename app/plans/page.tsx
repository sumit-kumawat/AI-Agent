import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { Badge } from "@/components/ui/badge";
import { findUserById } from "@/lib/db/queries";
import { planComparison } from "@/lib/plans/entitlements";
import { FEATURE_LABEL, FEATURES, formatPrice, formatTokens, WINDOWS, type Limits } from "@/lib/plans/types";
import { isStaff } from "@/lib/roles";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

const SKILL_LABEL: Record<string, string> = {
  code: "coding models",
  reasoning: "reasoning models",
  vision: "image input",
  tools: "tool calling",
};

function LimitList({ limits }: { limits: Limits }) {
  return (
    <ul className="space-y-1 text-sm">
      {WINDOWS.map((window) => (
        <li key={window} className="flex justify-between gap-3">
          <span className="capitalize text-muted-foreground">{window}</span>
          <span className="font-medium tabular-nums" data-limit={window}>
            {limits[window] === 0 ? "Unlimited" : `${formatTokens(limits[window])} tokens`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Feature({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${on ? "" : "text-muted-foreground"}`}>
      {on ? <Check className="size-4 text-primary" /> : <Minus className="size-4" />}
      {children}
    </li>
  );
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ highlight?: string }> }) {
  const sessionUser = await requireUser();
  const user = findUserById(sessionUser.id!);
  if (!user) redirect("/login");
  const plans = await planComparison(user);
  const { highlight } = await searchParams;
  const staff = isStaff(user.role);

  return (
    <PageFrame
      title="Plans"
      description="What each plan includes. Token allowances cover everything you send and receive: your messages, the conversation history the model rereads, attachments and replies."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const price = formatPrice(plan.price);
          const emphasised = highlight === plan.id;
          return (
            <section
              key={plan.id}
              data-plan-card={plan.id}
              className={`flex flex-col rounded-2xl border p-5 ${plan.current ? "border-primary" : ""} ${
                emphasised ? "ring-2 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-2xl">{plan.name}</h2>
                {plan.current ? <Badge data-current-plan>Current plan</Badge> : null}
              </div>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-3 text-lg font-medium" data-price>
                {price ?? "Price not set yet"}
              </p>

              <h3 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Token allowance</h3>
              <div className="mt-2">
                <LimitList limits={plan.limits} />
              </div>
              {FEATURES.some((feature) => WINDOWS.some((window) => plan.featureLimits[feature][window] > 0)) ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {FEATURES.flatMap((feature) =>
                    WINDOWS.filter((window) => plan.featureLimits[feature][window] > 0).map((window) => (
                      <li key={`${feature}-${window}`}>
                        {FEATURE_LABEL[feature]}: up to {formatTokens(plan.featureLimits[feature][window])} tokens {window === "daily" ? "a day" : window === "weekly" ? "a week" : "a month"}
                      </li>
                    )),
                  )}
                </ul>
              ) : null}

              <h3 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Models</h3>
              <p className="mt-2 text-sm" data-model-count={plan.modelCount}>
                {plan.modelCount} installed model{plan.modelCount === 1 ? "" : "s"}
              </p>
              {plan.skills.length ? (
                <p className="text-xs text-muted-foreground">
                  Including: {plan.skills.map((skill) => SKILL_LABEL[skill] ?? skill).join(", ")}
                </p>
              ) : null}
              {plan.models ? (
                <p className="mt-1 text-xs text-muted-foreground">{plan.models.join(", ") || "None installed yet"}</p>
              ) : null}

              <h3 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Includes</h3>
              <ul className="mt-2 space-y-1.5">
                <Feature on={plan.features.attachments}>
                  File attachments{plan.features.attachments ? ` (${plan.storageMb.attachments === 0 ? "unlimited" : formatStorage(plan.storageMb.attachments)} storage)` : ""}
                </Feature>
                <Feature on={plan.features.research}>Deep Research</Feature>
                <Feature on={plan.features.ide}>
                  IDE{plan.features.ide ? ` (${plan.storageMb.ide === 0 ? "unlimited" : formatStorage(plan.storageMb.ide)} workspace storage)` : ""}
                </Feature>
                <Feature on={plan.features.cloudModels}>Cloud models, when an admin connects a provider</Feature>
                <Feature on={plan.vision}>Image understanding</Feature>
              </ul>

              <div className="mt-auto pt-6">
                {plan.current ? (
                  <p className="text-sm text-muted-foreground">
                    {staff ? "Administrators are not limited by plans." : "You are on this plan."}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground" data-upgrade-path>
                    Online checkout is not available yet. To switch to {plan.name}, contact your administrator; they can
                    change your plan right away.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Allowances are separate from a model&apos;s context window, which limits how much one conversation can hold at once.
        Days start at 00:00 UTC and weeks on Monday. Monthly allowances reset on the 1st, or on the day your paid plan started.
      </p>
    </PageFrame>
  );
}

function formatStorage(megabytes: number) {
  return megabytes >= 1024 ? `${Math.round((megabytes / 1024) * 10) / 10} GB` : `${megabytes} MB`;
}
