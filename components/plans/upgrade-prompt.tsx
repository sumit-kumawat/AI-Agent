"use client";

import Link from "next/link";
import { Sparkles, TriangleAlert } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { formatTokens, WINDOW_LABEL, type PlanBlock, type UsageSummary } from "@/lib/plans/types";

/** Shown in place of a reply when the plan refused the request. */
export function UpgradePrompt({ block, onRetry }: { block: PlanBlock; onRetry?: () => void }) {
  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
      role="alert"
      data-plan-block={block.code}
      data-required-plan={block.requiredPlan?.id ?? ""}
    >
      <p className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{block.message}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {block.requiredPlan ? (
          <Button asChild size="sm">
            <Link href={`/plans?highlight=${block.requiredPlan.id}`}>See the {block.requiredPlan.name} plan</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href="/usage">View usage</Link>
        </Button>
        {onRetry && block.code === "limit_reached" ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A quiet line above the composer once any limited window passes 80%. */
export function UsageWarning({ usage }: { usage: UsageSummary }) {
  if (usage.staff || usage.peak === null || usage.peak < 80) return null;
  const tightest = usage.windows
    .filter((window) => window.percent !== null)
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
  if (!tightest) return null;
  const left = Math.max(0, tightest.limit - tightest.used);
  return (
    <p
      className="mx-auto flex w-full max-w-3xl items-center gap-1.5 px-4 pb-1 text-xs text-muted-foreground"
      data-usage-warning={tightest.window}
    >
      <TriangleAlert className="size-3.5 shrink-0 text-amber-600" />
      <span>
        {left === 0
          ? `${WINDOW_LABEL[tightest.window]}'s allowance is used up.`
          : `${formatTokens(left)} tokens left ${WINDOW_LABEL[tightest.window].toLowerCase()} (${tightest.percent}% used).`}{" "}
        Resets <LocalTime at={tightest.resetAt} />.{" "}
        <Link href="/plans" className="underline underline-offset-2">
          Compare plans
        </Link>
      </span>
    </p>
  );
}
