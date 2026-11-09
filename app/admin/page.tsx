import Link from "next/link";
import { Dashboard } from "@/components/admin/dashboard";
import { Empty, Section, TableCard } from "@/components/admin/ui";
import { businessMetrics, systemMetrics } from "@/lib/admin/metrics";
import { auditLog } from "@/lib/db/admin-queries";
import { formatAgo } from "@/lib/format";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const system = await systemMetrics();
  const business = businessMetrics(30);
  const recent = auditLog({ page: 1, q: "" }).rows.slice(0, 8);

  return (
    <>
      <Dashboard initial={{ system, business }} />
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
