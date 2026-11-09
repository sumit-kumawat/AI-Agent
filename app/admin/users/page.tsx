import { UserActions } from "@/components/admin/user-actions";
import {
  Empty,
  PageHeader,
  Pagination,
  SearchForm,
  TableCard,
  pageParam,
  stringParam,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin";
import { listUsers } from "@/lib/db/admin-queries";
import { findUserById } from "@/lib/db/queries";
import { getPlans } from "@/lib/plans/config";
import { overridesOf, usageSummary } from "@/lib/plans/usage";
import { formatAgo, formatCompact, formatDate, formatNumber } from "@/lib/format";
import { isStaff, ROLE_LABEL } from "@/lib/roles";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const q = stringParam(params.q);
  const page = pageParam(params.page);
  const { rows, total } = listUsers({ q, page });

  return (
    <>
      <PageHeader
        title="Users"
        description={`${formatNumber(total)} account${total === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}.`}
        actions={<SearchForm fields={[{ name: "q", placeholder: "Search email, name, ID or username", value: q }]} />}
      />
      <TableCard>
        {rows.length === 0 ? (
          <Empty>No users found.</Empty>
        ) : (
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
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
                  <TableRow key={user.id} className={user.suspended ? "opacity-60" : undefined}>
                    <TableCell className="max-w-64 pl-4">
                      <p className="truncate font-medium">{user.email}</p>
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
                          <div
                            className={`h-full ${percent >= 100 ? "bg-destructive" : "bg-primary"}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(user.tokensTotal)}</TableCell>
                    <TableCell className="pr-4">
                      <UserActions
                        user={{
                          id: user.id,
                          email: user.email,
                          role: user.role,
                          suspended: Boolean(user.suspended),
                          plan: usage.plan.id,
                          overrides: overridesOf(full),
                          planLimits: getPlans()[usage.plan.id].limits,
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
      <Pagination page={page} total={total} basePath="/admin/users" params={{ q }} />
    </>
  );
}
