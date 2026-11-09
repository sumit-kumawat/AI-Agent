import Link from "next/link";
import {
  Empty,
  PageHeader,
  Pagination,
  Section,
  StatCard,
  TableCard,
  pageParam,
  stringParam,
} from "@/components/admin/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  periodWindow,
  rateLimitLog,
  usageByModel,
  usageByUser,
  usageTimeline,
  type Period,
} from "@/lib/db/admin-queries";
import { formatCompact, formatDateTime, formatNumber, formatUsdMicro } from "@/lib/format";

export const metadata = { title: "Usage" };

const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = stringParam(params.period);
  const period: Period = requested === "weekly" || requested === "monthly" ? requested : "daily";
  const userPage = pageParam(params.page);
  const limitPage = pageParam(params.rlpage);

  const range = periodWindow(period);
  const timeline = usageTimeline(period);
  const byUser = usageByUser(period, userPage);
  const byModel = usageByModel(period);
  const limits = rateLimitLog(limitPage);
  const totalTokens = timeline.reduce((sum, row) => sum + row.tokens, 0);
  const totalCalls = timeline.reduce((sum, row) => sum + row.calls, 0);
  const totalCost = byModel.reduce((sum, row) => sum + (row.costMicro ?? 0), 0);
  const peak = Math.max(1, ...timeline.map((row) => row.tokens));

  return (
    <>
      <PageHeader
        title="Usage and cost"
        description={`Token consumption across all users. ${range.label}, grouped ${period === "daily" ? "by day" : period === "weekly" ? "by week" : "by month"}.`}
        actions={
          <div className="inline-flex rounded-lg border bg-card p-1" role="tablist" aria-label="Period">
            {PERIODS.map((item) => (
              <Link
                key={item.id}
                href={`/admin/usage?period=${item.id}`}
                role="tab"
                aria-selected={item.id === period}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  item.id === period ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Tokens" value={formatCompact(totalTokens)} hint={range.label} />
        <StatCard label="Model calls" value={formatNumber(totalCalls)} />
        <StatCard label="Estimated cost" value={formatUsdMicro(totalCost)} hint="From model prices" />
        <StatCard label="Active users" value={formatNumber(byUser.total)} />
        <StatCard
          label="Avg tokens per call"
          value={totalCalls ? formatNumber(Math.round(totalTokens / totalCalls)) : "0"}
        />
      </div>

      <Section title="Tokens over time">
        <div className="rounded-xl border bg-card p-4">
          {timeline.length === 0 ? (
            <Empty>No usage in this period yet.</Empty>
          ) : (
            <div className="flex h-48 items-end gap-1 overflow-x-auto">
              {timeline.map((row) => (
                <div key={row.bucket} className="group flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
                    {formatCompact(row.tokens)}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/80 group-hover:bg-primary"
                    style={{ height: `${Math.max(2, (row.tokens / peak) * 100)}%` }}
                    title={`${row.bucket}: ${formatNumber(row.tokens)} tokens, ${row.calls} calls`}
                  />
                  <span className="max-w-full truncate text-[10px] text-muted-foreground">
                    {period === "daily" ? row.bucket.slice(5) : row.bucket}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Per-user consumption" description="Sorted by tokens used in the period.">
        <TableCard>
          {byUser.rows.length === 0 ? (
            <Empty>No usage in this period yet.</Empty>
          ) : (
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">User</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="pr-4 text-right">Total tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byUser.rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="pl-4">{row.email ?? <span className="text-muted-foreground">Deleted user</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.inputTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.outputTokens)}</TableCell>
                    <TableCell className="pr-4 text-right font-medium tabular-nums">{formatNumber(row.tokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
        <Pagination
          page={userPage}
          total={byUser.total}
          basePath="/admin/usage"
          params={{ period, rlpage: String(limitPage) }}
        />
      </Section>

      <Section title="Per-model breakdown" description="Calls routed to each model and agent.">
        <TableCard>
          {byModel.length === 0 ? (
            <Empty>No model calls in this period yet.</Empty>
          ) : (
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Avg reply</TableHead>
                  <TableHead className="pr-4 text-right">Errors / blocked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byModel.map((row) => (
                  <TableRow key={`${row.providerId ?? ""}:${row.agentId}:${row.model}`}>
                    <TableCell className="pl-4 font-mono text-xs">{row.model}</TableCell>
                    <TableCell className="text-muted-foreground">{row.providerId ?? row.agentId}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsdMicro(row.costMicro)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.avgMs ? `${(row.avgMs / 1000).toFixed(1)}s` : "–"}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {row.errors} / {row.blocked}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </Section>

      <div id="rate-limits">
        <Section title="Rate-limit hits" description="The first rejection per user and endpoint in each limit window.">
          <TableCard>
            {limits.rows.length === 0 ? (
              <Empty>Nobody has hit a rate limit.</Empty>
            ) : (
              <Table className="min-w-[40rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead className="pr-4">Limit key</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {limits.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                      <TableCell>{row.email ?? row.ip ?? <span className="text-muted-foreground">Unknown (no proxy IP)</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{row.endpoint}</TableCell>
                      <TableCell className="max-w-64 truncate pr-4 font-mono text-xs text-muted-foreground">{row.limitKey}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCard>
          <Pagination
            page={limitPage}
            total={limits.total}
            basePath="/admin/usage"
            params={{ period, page: String(userPage) }}
            pageKey="rlpage"
            hash="#rate-limits"
          />
        </Section>
      </div>
    </>
  );
}
