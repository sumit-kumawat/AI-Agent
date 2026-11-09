import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/page-frame";
import { LocalTime } from "@/components/local-time";
import { findUserById } from "@/lib/db/queries";
import { accountSummary } from "@/lib/plans/entitlements";
import { FEATURE_LABEL, WINDOW_LABEL } from "@/lib/plans/types";
import { usageBreakdown } from "@/lib/plans/usage";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

const FEATURE_NAMES: Record<string, string> = { ...FEATURE_LABEL, summary: "Conversation summaries" };

export default async function UsagePage() {
  const sessionUser = await requireUser();
  const user = findUserById(sessionUser.id!);
  if (!user) redirect("/login");
  const summary = accountSummary(user);
  const breakdown = usageBreakdown(user);
  const monthTotal = breakdown.byModel.reduce((sum, row) => sum + row.total, 0);

  return (
    <PageFrame
      title="Usage"
      description={`Tokens used on the ${summary.plan.name} plan, from the counts each model reported.`}
    >
      {summary.staff ? (
        <p className="mb-4 rounded-lg border bg-muted/40 px-3 py-2 text-sm">Administrators are not limited by plans.</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {summary.windows.map((window) => (
          <section key={window.window} className="rounded-xl border p-4" data-usage-window={window.window}>
            <h2 className="text-sm text-muted-foreground">{WINDOW_LABEL[window.window]}</h2>
            <p className="mt-1 text-2xl font-medium tabular-nums" data-used={window.used}>
              {window.used.toLocaleString("en-US")}
            </p>
            <p className="text-sm text-muted-foreground" data-limit={window.limit}>
              {window.limit === 0 ? "No limit" : `of ${window.limit.toLocaleString("en-US")} tokens`}
            </p>
            {window.percent !== null ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${window.percent}% used`}>
                <div
                  className={`h-full ${window.percent >= 100 ? "bg-destructive" : window.percent >= 80 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${window.percent}%` }}
                />
              </div>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Resets <LocalTime at={window.resetAt} />
            </p>
          </section>
        ))}
      </div>

      <h2 className="mt-8 font-medium">This month by model</h2>
      <p className="text-sm text-muted-foreground">
        Since <LocalTime at={breakdown.since} />.
        {summary.estimatedTokens > 0
          ? ` ${summary.estimatedTokens.toLocaleString("en-US")} of these tokens are estimates, because the model did not report exact counts for some replies.`
          : ""}
      </p>
      {breakdown.byModel.length === 0 ? (
        <p className="mt-3 rounded-xl border p-6 text-center text-sm text-muted-foreground">No usage this month yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[32rem] text-sm" data-usage-models>
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-normal">Model</th>
                <th className="px-4 py-2 text-right font-normal">Requests</th>
                <th className="px-4 py-2 text-right font-normal">Input</th>
                <th className="px-4 py-2 text-right font-normal">Output</th>
                <th className="px-4 py-2 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.byModel.map((row) => (
                <tr key={row.model} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{row.model}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.requests.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.input.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.output.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.total.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {breakdown.byFeature.length > 0 ? (
        <>
          <h2 className="mt-8 font-medium">By feature</h2>
          <ul className="mt-3 space-y-2">
            {breakdown.byFeature.map((row) => (
              <li key={row.feature} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0">{FEATURE_NAMES[row.feature] ?? row.feature}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${monthTotal ? Math.round((row.total / monthTotal) * 100) : 0}%` }} />
                </div>
                <span className="w-28 text-right tabular-nums">{row.total.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-8 text-sm">
        Need more? <Link href="/plans" className="underline underline-offset-4">Compare plans</Link>.
      </p>
    </PageFrame>
  );
}
