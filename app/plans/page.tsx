import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { PageFrame } from "@/components/page-frame";
import { PlanCheckoutButton } from "@/components/plans/checkout-button";
import { CurrencyPicker } from "@/components/plans/currency-picker";
import { Badge } from "@/components/ui/badge";
import { findUserById } from "@/lib/db/queries";
import { checkoutAvailability } from "@/lib/integrations/checkout";
import { planComparison } from "@/lib/plans/entitlements";
import { FEATURE_LABEL, FEATURES, formatTokens, WINDOWS, type Limits } from "@/lib/plans/types";
import { convertPrice, FX_SOURCE_NAME } from "@/lib/pricing/fx";
import { CURRENCY_COOKIE, DISPLAY_CURRENCIES, formatMoney, guessCurrency } from "@/lib/pricing/locale";
import { isStaff } from "@/lib/roles";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

const SKILL_LABEL: Record<string, string> = {
  code: "coding",
  reasoning: "reasoning",
  vision: "image understanding",
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
  const checkout = checkoutAvailability();
  const providerLabel = checkout.available
    ? checkout.provider === "razorpay"
      ? "Razorpay"
      : checkout.provider === "stripe"
        ? "Stripe"
        : "checkout"
    : null;
  const baseCurrency = plans.find((plan) => plan.price)?.price?.currency ?? "INR";
  const guess = guessCurrency(await headers(), (await cookies()).get(CURRENCY_COOKIE)?.value, baseCurrency);
  const prices = await Promise.all(plans.map((plan) => (plan.price ? convertPrice(plan.price, guess.currency) : null)));
  const rateDate = prices.find((price) => price?.local)?.local?.date ?? null;
  const unavailable = prices.find((price) => price?.unavailable)?.unavailable ?? null;

  return (
    <PageFrame
      title="Plans"
      description="What each plan includes. Token allowances cover everything you send and receive: your messages, the conversation history the assistant rereads, attachments and replies."
      actions={<CurrencyPicker value={guess.currency} options={DISPLAY_CURRENCIES} cookie={CURRENCY_COOKIE} />}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan, index) => {
          const price = prices[index];
          const interval = plan.price?.interval === "year" ? "year" : "month";
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
              <div className="mt-3 min-h-12" data-price>
                {!price ? (
                  <p className="text-lg font-medium">Price not set yet</p>
                ) : price.local ? (
                  <>
                    <p className="text-lg font-medium" data-local-price={price.local.currency}>
                      ≈ {formatMoney(price.local.amount, price.local.currency)} <span className="text-sm font-normal text-muted-foreground">/ {interval}</span>
                    </p>
                    <p className="text-xs text-muted-foreground" data-base-price={price.base.currency}>
                      Billed as {formatMoney(price.base.amount, price.base.currency)} {price.base.currency} / {interval}
                    </p>
                  </>
                ) : (
                  <p className="text-lg font-medium" data-base-price={price.base.currency}>
                    {formatMoney(price.base.amount, price.base.currency)} <span className="text-sm font-normal text-muted-foreground">/ {interval}</span>
                  </p>
                )}
              </div>

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

              <h3 className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Assistants</h3>
              <p className="mt-2 text-sm" data-model-count={plan.modelCount}>
                {plan.modelCount} assistant{plan.modelCount === 1 ? "" : "s"}
              </p>
              {plan.skills.length ? (
                <p className="text-xs text-muted-foreground">
                  Including: {plan.skills.map((skill) => SKILL_LABEL[skill] ?? skill).join(", ")}
                </p>
              ) : null}
              {plan.models ? (
                <p className="mt-1 text-xs text-muted-foreground">{plan.models.join(", ") || "None available yet"}</p>
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
                <Feature on={plan.features.cloudModels}>External assistants, when available</Feature>
                <Feature on={plan.vision}>Image understanding</Feature>
              </ul>

              <div className="mt-auto pt-6">
                {plan.current ? (
                  <p className="text-sm text-muted-foreground">
                    {staff ? "Administrators are not limited by plans." : "You are on this plan."}
                  </p>
                ) : staff ? (
                  <p className="text-sm text-muted-foreground">Administrators are not limited by plans.</p>
                ) : checkout.available && plan.price && plan.price.amount > 0 && providerLabel ? (
                  <div className="space-y-2" data-upgrade-path="checkout">
                    <PlanCheckoutButton planId={plan.id} planName={plan.name} providerLabel={providerLabel} />
                    <p className="text-xs text-muted-foreground">
                      Pay with {providerLabel}. Your plan updates as soon as payment succeeds.
                    </p>
                  </div>
                ) : checkout.available && !plan.price ? (
                  <p className="text-sm text-muted-foreground" data-upgrade-path="no-price">
                    No price is set for {plan.name} yet. Ask your administrator to set one, or to switch you manually.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground" data-upgrade-path="manual">
                    Online checkout is not available yet. To switch to {plan.name}, contact your administrator; they can
                    change your plan right away.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {prices.some(Boolean) ? (
        <p className="mt-6 text-xs text-muted-foreground" data-fx-note>
          {rateDate
            ? `Prices in ${guess.currency} are approximate, converted from ${baseCurrency} with the ${FX_SOURCE_NAME} of ${rateDate}. You are charged the ${baseCurrency} amount; your bank sets the final conversion. `
            : unavailable
              ? `${unavailable} Prices are shown in ${baseCurrency}, the currency you are charged in. `
              : `Prices are in ${baseCurrency}, the currency you are charged in. `}
          {guess.source === "language" || guess.source === "network" ? "The currency was picked from your browser settings; change it above." : null}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Allowances are separate from an assistant&apos;s context window, which limits how much one conversation can hold at once.
        Days start at 00:00 UTC and weeks on Monday. Monthly allowances reset on the 1st, or on the day your paid plan started.
      </p>
    </PageFrame>
  );
}

function formatStorage(megabytes: number) {
  return megabytes >= 1024 ? `${Math.round((megabytes / 1024) * 10) / 10} GB` : `${megabytes} MB`;
}
