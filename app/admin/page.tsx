import Link from "next/link";
import { PageHeader, Section, StatCard, TableCard, Empty } from "@/components/admin/ui";
import { listSessions } from "@/lib/agents";
import { auditLog, overviewStats } from "@/lib/db/admin-queries";
import { formatAgo, formatCompact, formatNumber } from "@/lib/format";

export const metadata = { title: "Overview" };

export default function AdminOverviewPage() {
  const stats = overviewStats();
  const running = listSessions().length;
  const recent = auditLog({ page: 1, q: "" }).rows.slice(0, 8);

  return (
    <>
      <PageHeader title="Overview" description="What is happening on this server right now." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={formatNumber(stats.users)}
          hint={`${stats.admins} admin${stats.admins === 1 ? "" : "s"} · ${stats.suspended} suspended`}
        />
        <StatCard label="Active today" value={formatNumber(stats.activeToday)} hint="Signed in or chatted in 24h" />
        <StatCard label="Tokens today" value={formatCompact(stats.tokensToday)} hint={`${formatNumber(stats.callsToday)} model calls`} />
        <StatCard label="Tokens this month" value={formatCompact(stats.tokensMonth)} />
        <StatCard
          label="Running sessions"
          value={running}
          hint={<Link href="/admin/agents" className="underline">Manage agents</Link>}
        />
        <StatCard label="Conversations" value={formatNumber(stats.conversations)} />
        <StatCard
          label="Rate-limit hits"
          value={formatNumber(stats.rateLimitHits)}
          hint={<Link href="/admin/usage#rate-limits" className="underline">Last 24h</Link>}
        />
        <StatCard
          label="Flagged messages"
          value={formatNumber(stats.flagged)}
          hint={<Link href="/admin/conversations?flagged=1" className="underline">Review</Link>}
        />
      </div>

      <Section
        title="Recent admin activity"
        actions={<Link href="/admin/settings#audit" className="text-sm underline">Full audit log</Link>}
      >
        <TableCard>
          {recent.length === 0 ? (
            <Empty>No admin actions yet.</Empty>
          ) : (
            <ul className="divide-y">
              {recent.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-mono text-xs">{entry.action}</span>
                  <span className="text-muted-foreground">by {entry.adminEmail}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatAgo(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </TableCard>
      </Section>
    </>
  );
}
