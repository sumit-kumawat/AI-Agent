import Link from "next/link";
import { Empty, PageHeader, TableCard } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireCustomer } from "@/lib/customer";
import { formatDate } from "@/lib/format";
import { listProjectsForUser, PROJECT_TYPES, projectLabel, type ProjectType } from "@/lib/projects";

export const metadata = { title: "Requests" };

export default async function ProjectsPage() {
  const user = await requireCustomer("/portal/projects");
  const projects = listProjectsForUser(user.id);
  return (
    <>
      <PageHeader
        title="Requests"
        description="Custom projects, domain requests, questions and support. Our replies appear here."
        actions={
          <Button asChild className="rounded-full">
            <Link href="/portal/projects/new">New request</Link>
          </Button>
        }
      />
      <TableCard>
        {projects.length === 0 ? (
          <Empty>No requests yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Request</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="pl-4">
                    <Link href={`/portal/projects/${project.id}`} className="font-medium hover:underline">
                      {project.title}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{project.reference}</p>
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
    </>
  );
}
