import Link from "next/link";
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
import { searchConversations } from "@/lib/db/admin-queries";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata = { title: "Conversations" };

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const email = stringParam(params.email);
  const q = stringParam(params.q);
  const flagged = stringParam(params.flagged) === "1";
  const page = pageParam(params.page);
  const { rows, total } = searchConversations({ email, q, flagged, page });
  const filterParams = { email, q, ...(flagged ? { flagged: "1" } : {}) };
  const toggleFlagged = new URLSearchParams({ email, q, ...(flagged ? {} : { flagged: "1" }) });
  for (const [key, value] of [...toggleFlagged]) if (!value) toggleFlagged.delete(key);

  return (
    <>
      <PageHeader
        title="Conversation audit"
        description="Chat metadata only. Reading messages requires a written reason, which is recorded in the audit log and grants access to that chat for 30 minutes."
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchForm
          fields={[
            { name: "email", placeholder: "User email", value: email },
            { name: "q", placeholder: "Keyword in title", value: q },
          ]}
          hidden={flagged ? { flagged: "1" } : undefined}
        />
        <Link
          href={`/admin/conversations?${toggleFlagged}`}
          className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm ${
            flagged ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
          }`}
        >
          {flagged ? "Showing flagged only" : "Only flagged"}
        </Link>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">{formatNumber(total)} conversation{total === 1 ? "" : "s"}</p>
      <TableCard>
        {rows.length === 0 ? (
          <Empty>No conversations match.</Empty>
        ) : (
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Title</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="pr-4">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-80 pl-4">
                    <Link href={`/admin/conversations/${row.id}`} className="block truncate font-medium hover:underline">
                      {row.title}
                    </Link>
                    {row.flagged > 0 ? (
                      <Badge variant="destructive" className="mt-1">{row.flagged} flagged</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.email}</TableCell>
                  <TableCell className="font-mono text-xs">{row.model ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.messages}</TableCell>
                  <TableCell className="pr-4 whitespace-nowrap text-muted-foreground">{formatDateTime(row.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      <Pagination page={page} total={total} basePath="/admin/conversations" params={filterParams} />
    </>
  );
}
