import Link from "next/link";
import { Empty, PageHeader, TableCard } from "@/components/admin/ui";
import { StatusBadge } from "@/components/portal/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CYCLE_LABEL, formatMoney, type Cycle } from "@/lib/billing/money";
import { listServicesForUser } from "@/lib/billing/store";
import { requireCustomer } from "@/lib/customer";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const user = await requireCustomer("/portal/services");
  const services = listServicesForUser(user.id);
  return (
    <>
      <PageHeader
        title="Services"
        description="Everything you have ordered from CONZEX."
        actions={
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/hosting/cloud">Order a service</Link>
          </Button>
        }
      />
      <TableCard>
        {services.length === 0 ? (
          <Empty>No services yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Service</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="pl-4">
                    <Link href={`/portal/services/${service.id}`} className="font-medium hover:underline">
                      {service.name}
                    </Link>
                    {service.label ? <p className="text-xs text-muted-foreground">{service.label}</p> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatMoney(service.amountMinor, service.currency)} · {CYCLE_LABEL[service.cycle as Cycle] ?? service.cycle}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{service.nextDueAt ? formatDate(service.nextDueAt) : "—"}</TableCell>
                  <TableCell className="pr-4">
                    <StatusBadge status={service.status} />
                    {service.cancelRequestedAt && service.status === "active" ? (
                      <span className="ml-2 text-xs text-muted-foreground">Ends at term</span>
                    ) : null}
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
