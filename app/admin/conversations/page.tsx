import Link from "next/link";
import { Flag, Paperclip, Pin, Timer } from "lucide-react";
import { BulkConversationActions, RetentionForm } from "@/components/admin/conversation-tools";
import { SelectAll, SelectionProvider, SelectRow } from "@/components/admin/selection";
import { Empty, PageHeader, Pagination, SearchForm, TableCard, pageParam, stringParam } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin";
import { searchConversations } from "@/lib/db/admin-queries";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Conversations" };

const INACTIVE = [0, 30, 90, 365];

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const email = stringParam(params.email);
  const q = stringParam(params.q);
  const flagged = stringParam(params.flagged) === "1";
  const withFiles = stringParam(params.files) === "1";
  const inactiveParam = Number(stringParam(params.inactive));
  const inactiveDays = INACTIVE.includes(inactiveParam) ? inactiveParam : 0;
  const page = pageParam(params.page);
  const { rows, total } = searchConversations({ email, q, flagged, page, inactiveDays, withFiles });
  const state: Record<string, string> = {
    email,
    q,
    flagged: flagged ? "1" : "",
    files: withFiles ? "1" : "",
    inactive: inactiveDays ? String(inactiveDays) : "",
  };
  const href = (next: Record<string, string>) => {
    const search = new URLSearchParams({ ...state, ...next });
    for (const [key, value] of [...search]) if (!value) search.delete(key);
    const query = search.toString();
    return `/admin/conversations${query ? `?${query}` : ""}`;
  };
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`;
  const hidden = Object.fromEntries(Object.entries(state).filter(([key, value]) => value && key !== "email" && key !== "q"));

  return (
    <SelectionProvider>
      <PageHeader
        title="Conversations"
        description="Titles, owners and counts only. Reading or exporting messages needs a written reason, which is recorded in the audit log."
        actions={
          <SearchForm
            fields={[
              { name: "email", placeholder: "User email", value: email },
              { name: "q", placeholder: "Keyword in title", value: q },
            ]}
            hidden={hidden}
          />
        }
      />
      <div className="mb-4">
        <RetentionForm days={getSettings().conversationRetentionDays} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5" data-conversation-filters>
        <Link href={href({ flagged: flagged ? "" : "1", page: "" })} className={chip(flagged)}>
          <Flag className="size-3" aria-hidden /> Flagged
        </Link>
        <Link href={href({ files: withFiles ? "" : "1", page: "" })} className={chip(withFiles)}>
          <Paperclip className="size-3" aria-hidden /> With files
        </Link>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {INACTIVE.map((days) => (
          <Link key={days} href={href({ inactive: days ? String(days) : "", page: "" })} className={chip(inactiveDays === days)} data-inactive-filter={days}>
            {days === 0 ? "Any activity" : `Inactive ${days}+ days`}
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {formatNumber(total)} conversation{total === 1 ? "" : "s"}
        </span>
      </div>
      <BulkConversationActions />
      <TableCard>
        {rows.length === 0 ? (
          <Empty>No conversations match.</Empty>
        ) : (
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">
                  <SelectAll ids={rows.map((row) => row.id)} />
                </TableHead>
                <TableHead>Title</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="pr-4">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-conversation-row={row.id}>
                  <TableCell className="pl-4">
                    <SelectRow id={row.id} label={row.title} kind="conversation" />
                  </TableCell>
                  <TableCell className="max-w-80">
                    <Link href={`/admin/conversations/${row.id}`} className="block truncate font-medium hover:underline">
                      {row.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                      {row.flagged > 0 ? <Badge variant="destructive">{row.flagged} flagged</Badge> : null}
                      {row.pinned ? (
                        <Badge variant="outline">
                          <Pin /> pinned
                        </Badge>
                      ) : null}
                      {row.temporary ? (
                        <Badge variant="outline">
                          <Timer /> temporary
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/users/${row.userId}`} className="text-muted-foreground hover:text-foreground hover:underline">
                      {row.email}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.model ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.messages}</TableCell>
                  <TableCell className="text-right tabular-nums" title={row.attachments ? formatBytes(row.attachmentBytes) : undefined}>
                    {row.attachments || "–"}
                  </TableCell>
                  <TableCell className="pr-4 whitespace-nowrap text-muted-foreground">{formatDateTime(row.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      <Pagination page={page} total={total} basePath="/admin/conversations" params={state} />
    </SelectionProvider>
  );
}
