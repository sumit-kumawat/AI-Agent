import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { UserActions } from "@/components/admin/user-actions";
import { Empty, PageHeader, Section, StatCard, TableCard } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin";
import { userActivity, userDataSummary } from "@/lib/admin/user-data";
import { findUserById } from "@/lib/db/queries";
import { formatAgo, formatBytes, formatCompact, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { getPlans } from "@/lib/plans/config";
import { overridesOf, usageBreakdown, usageSummary } from "@/lib/plans/usage";
import { isStaff, ROLE_LABEL } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata = { title: "User" };

const SECURITY_LABEL: Record<string, string> = {
  login_failed: "Wrong password or unknown account",
  login_suspended: "Sign-in while suspended",
  login_rate_limited: "Too many attempts",
};

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const user = findUserById(id);
  const data = user ? userDataSummary(id) : null;
  if (!user || !data) notFound();
  const usage = usageSummary(user);
  const breakdown = usageBreakdown(user);
  const activity = userActivity(user.id, user.email);
  const plans = getPlans();

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Users
      </Link>
      <PageHeader
        title={user.name}
        description={`${user.email} · @${user.username} · ${user.publicId}`}
        actions={
          <UserActions
            user={{
              id: user.id,
              email: user.email,
              name: user.name,
              username: user.username ?? "",
              role: user.role,
              suspended: user.suspended,
              plan: usage.plan.id,
              overrides: overridesOf(user),
              planLimits: plans[usage.plan.id].limits,
              self: user.id === admin.id,
            }}
            viewerRole={admin.role}
          />
        }
      />
      <div className="mb-6 flex flex-wrap gap-1.5" data-user-detail={user.id}>
        <Badge variant={isStaff(user.role) ? "default" : "secondary"}>{ROLE_LABEL[user.role]}</Badge>
        {user.suspended ? <Badge variant="destructive">suspended</Badge> : <Badge variant="outline">active</Badge>}
        <Badge variant="outline">{usage.plan.name}</Badge>
        {user.limitOverrides ? <Badge variant="outline">custom limits</Badge> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Joined" value={formatDate(user.createdAt)} hint={`Last active ${formatAgo(user.lastActiveAt)}`} />
        <StatCard label="Conversations" value={formatNumber(data.conversations)} hint={`${formatNumber(data.messages)} messages`} />
        <StatCard label="Files" value={formatNumber(data.attachments)} hint={formatBytes(data.attachmentBytes)} />
        <StatCard label="IDE workspaces" value={formatNumber(data.workspaces)} hint={formatBytes(data.workspaceBytes)} />
      </div>

      <Section title="Usage" description={`Plan windows and this billing month since ${formatDate(breakdown.since)}.`}>
        <div id="usage" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-user-usage>
          {usage.windows.map((window) => (
            <StatCard
              key={window.window}
              label={window.window}
              value={formatCompact(window.used)}
              hint={window.limit === 0 ? "No limit" : `of ${formatCompact(window.limit)} tokens`}
            />
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <TableCard>
            {breakdown.byModel.length === 0 ? (
              <Empty>No metered requests this month.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="pr-4 text-right">Tokens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.byModel.map((row) => (
                    <TableRow key={row.model}>
                      <TableCell className="max-w-64 truncate pl-4 font-mono text-xs">{row.model}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.requests)}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{formatNumber(row.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCard>
          <TableCard>
            {breakdown.byFeature.length === 0 ? (
              <Empty>No usage by feature this month.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Feature</TableHead>
                    <TableHead className="pr-4 text-right">Tokens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.byFeature.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="pl-4 capitalize">{row.feature}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{formatNumber(row.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCard>
        </div>
      </Section>

      <Section title="Recent requests" description={`${formatNumber(data.usageEvents)} recorded in total. These records are kept if the account is deleted.`}>
        <TableCard>
          {activity.usage.length === 0 ? (
            <Empty>No requests recorded.</Empty>
          ) : (
            <Table data-user-requests>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="pr-4 text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.usage.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 text-muted-foreground">{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell className="capitalize">{row.feature}</TableCell>
                    <TableCell className="max-w-56 truncate font-mono text-xs">{row.model}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "ok" ? "secondary" : row.status === "error" ? "destructive" : "outline"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalTokens)}
                      {row.estimated ? <span className="text-xs text-muted-foreground" title="Estimated from text length"> est.</span> : null}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{(row.durationMs / 1000).toFixed(1)} s</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </Section>

      <Section title="Activity" description="Administrator actions on or by this account, and sign-in problems.">
        <div id="activity" className="grid gap-3 lg:grid-cols-2">
          <TableCard>
            {activity.audit.length === 0 ? (
              <Empty>No administrator actions recorded.</Empty>
            ) : (
              <ul className="divide-y text-sm" data-user-audit>
                {activity.audit.map((row) => (
                  <li key={row.id} className="px-4 py-2.5">
                    <p>
                      <span className="font-mono text-xs">{row.action}</span>
                      <span className="text-muted-foreground"> by {row.adminEmail}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </TableCard>
          <TableCard>
            {activity.security.length === 0 ? (
              <Empty>No failed or blocked sign-ins recorded.</Empty>
            ) : (
              <ul className="divide-y text-sm" data-user-security>
                {activity.security.map((row) => (
                  <li key={row.id} className="px-4 py-2.5">
                    <p>{SECURITY_LABEL[row.type] ?? row.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                      {row.ip ? ` · IP ${row.ip}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TableCard>
        </div>
      </Section>
    </>
  );
}
