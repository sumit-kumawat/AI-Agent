import Link from "next/link";
import { StatusFilter } from "@/components/admin/billing-nav";
import { Empty, PageHeader, Pagination, pageParam, SearchForm, stringParam, TableCard } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAGE_SIZE } from "@/lib/db/admin-queries";
import { formatDate } from "@/lib/format";
import { adminProjects, PROJECT_STATUSES, PROJECT_TYPES, projectLabel, type ProjectType } from "@/lib/projects";

export const metadata = { title: "Requests" };

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = params.status === undefined ? "open" : stringParam(params.status);
  const q = stringParam(params.q);
  const page = pageParam(params.page);
  const { rows, total } = adminProjects({ status, q, page, pageSize: PAGE_SIZE });

  return (
    <>
      <PageHeader title="Requests" description="Custom projects, domain requests and support from customers." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusFilter
          basePath="/admin/projects"
          current={status}
          q={q}
          options={[["open", "Open"], ...Object.entries(PROJECT_STATUSES), ["all", "All"]]}
        />
        <SearchForm fields={[{ name: "q", placeholder: "Reference, title or email", value: q }]} hidden={{ status }} />
      </div>
      <TableCard>
        {rows.length === 0 ? (
          <Empty>No requests match.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Request</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ project, email, name }) => (
                <TableRow key={project.id}>
                  <TableCell className="pl-4">
                    <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                      {project.title}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{project.reference}</p>
                  </TableCell>
                  <TableCell>
                    <p>{name}</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{PROJECT_TYPES[project.type as ProjectType] ?? project.type}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(project.updatedAt)}</TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={project.status} label={projectLabel(project.status)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
      <Pagination page={page} total={total} basePath="/admin/projects" params={{ status, q }} />
    </>
  );
}
