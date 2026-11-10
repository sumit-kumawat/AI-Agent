import Link from "next/link";
import { UserActions } from "@/components/admin/user-actions";
import { BulkUserActions, SelectAllUsers, SelectUser, UserSelection } from "@/components/admin/user-selection";
import { Empty, PageHeader, Pagination, SearchForm, TableCard, pageParam, stringParam } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin";
import { listUsers, USER_STATUSES, type UserStatus } from "@/lib/db/admin-queries";
import { findUserById } from "@/lib/db/queries";
import { getPlans } from "@/lib/plans/config";
import { PLAN_IDS } from "@/lib/plans/types";
import { overridesOf, usageSummary } from "@/lib/plans/usage";
import { formatAgo, formatCompact, formatDate, formatNumber } from "@/lib/format";
import { isStaff, ROLE_LABEL } from "@/lib/roles";

export const metadata = { title: "Users" };

const STATUS_LABEL: Record<UserStatus, string> = {
  all: "All",
  active: "Active (30 days)",
  inactive: "Inactive",
  suspended: "Suspended",
  staff: "Admins",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const q = stringParam(params.q);
  const page = pageParam(params.page);
  const statusParam = stringParam(params.status);
  const status: UserStatus = (USER_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as UserStatus) : "all";
  const planParam = stringParam(params.plan);
  const plan = (PLAN_IDS as readonly string[]).includes(planParam) ? planParam : "";
  const { rows, total } = listUsers({ q, page, status, plan });
  const plans = getPlans();
  const canAct = (row: { id: string; role: string }) => row.id !== admin.id && (!isStaff(row.role) || admin.role === "superadmin");
  const filterHref = (next: Record<string, string>) => {
    const search = new URLSearchParams({ q, status, plan, ...next });
    for (const [key, value] of [...search]) if (!value || value === "all") search.delete(key);
    const query = search.toString();
    return `/admin/users${query ? `?${query}` : ""}`;
  };
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <UserSelection>
      <PageHeader
        title="Users"
        description={`${formatNumber(total)} account${total === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}.`}
        actions={<SearchForm fields={[{ name: "q", placeholder: "Email, name, ID or username", value: q }]} hidden={{ status, plan }} />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5" data-user-filters>
        {USER_STATUSES.map((value) => (
          <Link key={value} href={filterHref({ status: value, page: "" })} className={chip(status === value)} data-status-filter={value}>
            {STATUS_LABEL[value]}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Link href={filterHref({ plan: "", page: "" })} className={chip(plan === "")}>
          Any plan
        </Link>
        {PLAN_IDS.map((id) => (
          <Link key={id} href={filterHref({ plan: id, page: "" })} className={chip(plan === id)} data-plan-filter={id}>
            {plans[id].name}
          </Link>
        ))}
      </div>
      <BulkUserActions />
      <TableCard>
        {rows.length === 0 ? (
          <Empty>No users found.</Empty>
        ) : (
          <Table className="min-w-[58rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <SelectAllUsers ids={rows.filter(canAct).map((row) => row.id)} />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Plan and usage</TableHead>
                <TableHead className="text-right">Total tokens</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => {
                const full = findUserById(user.id)!;
                const usage = usageSummary(full);
                const monthly = usage.windows.find((window) => window.window === "monthly")!;
                const percent = usage.peak satisfies number | null;
                return (
                  <TableRow key={user.id} className={user.suspended ? "opacity-60" : undefined} data-user-row={user.email}>
                    <TableCell className="pl-4">
                      <SelectUser id={user.id} label={user.email} disabled={!canAct(user)} />
                    </TableCell>
                    <TableCell className="max-w-64">
                      <Link href={`/admin/users/${user.id}`} className="block truncate font-medium hover:underline">
                        {user.email}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.name} · {user.conversations} chat{user.conversations === 1 ? "" : "s"}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground" data-public-id={user.publicId}>
                        {user.publicId} · @{user.username}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={isStaff(user.role) ? "default" : "secondary"}>{ROLE_LABEL[user.role]}</Badge>
                        {user.suspended ? <Badge variant="destructive">suspended</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatAgo(user.lastActiveAt)}</TableCell>
                    <TableCell>
                      <p data-user-plan={usage.plan.id}>
                        {usage.plan.name}
                        {full.limitOverrides ? <span className="text-xs text-muted-foreground"> · custom limits</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCompact(monthly.used)} / {monthly.limit === 0 ? "unlimited" : formatCompact(monthly.limit)} this month
                        {percent !== null && percent >= 100 ? " · limit reached" : ""}
                      </p>
                      {percent !== null ? (
                        <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${percent >= 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percent}%` }} />
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(user.tokensTotal)}</TableCell>
                    <TableCell className="pr-4">
                      <UserActions
                        user={{
                          id: user.id,
                          email: user.email,
                          name: user.name,
                          username: user.username,
                          role: user.role,
                          suspended: Boolean(user.suspended),
                          plan: usage.plan.id,
                          overrides: overridesOf(full),
                          planLimits: plans[usage.plan.id].limits,
                          self: user.id === admin.id,
                        }}
                        viewerRole={admin.role}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>
      <Pagination page={page} total={total} basePath="/admin/users" params={{ q, status: status === "all" ? "" : status, plan }} />
    </UserSelection>
  );
}
