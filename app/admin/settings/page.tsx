import { SettingsForm } from "@/components/admin/settings-form";
import {
  Empty,
  PageHeader,
  Pagination,
  SearchForm,
  Section,
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
import { auditLog } from "@/lib/db/admin-queries";
import { formatDateTime } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Settings" };

function describe(details: string | null) {
  if (!details) return "";
  try {
    return JSON.stringify(JSON.parse(details));
  } catch {
    return details;
  }
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = stringParam(params.q);
  const page = pageParam(params.page);
  const log = auditLog({ page, q });

  return (
    <>
      <PageHeader title="System settings" description="Server-wide controls. Every change is written to the audit log." />
      <SettingsForm initial={getSettings()} />

      <div id="audit" className="mt-10 scroll-mt-4">
        <Section
          title="Audit log"
          description="Every admin action: who changed what, and when."
          actions={<SearchForm fields={[{ name: "q", placeholder: "Filter by action, admin, or target", value: q }]} />}
        >
          <TableCard>
            {log.rows.length === 0 ? (
              <Empty>{q ? "No entries match that filter." : "No admin actions yet."}</Empty>
            ) : (
              <Table className="min-w-[48rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">When</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="pr-4">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.rows.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>{entry.adminEmail}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                        {entry.targetType}
                        {entry.targetId ? `:${entry.targetId}` : ""}
                      </TableCell>
                      <TableCell className="max-w-96 pr-4">
                        <p className="line-clamp-2 font-mono text-xs break-all text-muted-foreground" title={describe(entry.details)}>
                          {describe(entry.details)}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCard>
          <Pagination page={page} total={log.total} basePath="/admin/settings" params={{ q }} hash="#audit" />
        </Section>
      </div>
    </>
  );
}
