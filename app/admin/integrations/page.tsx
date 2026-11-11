import { IntegrationsForm } from "@/components/admin/integrations-form";
import { PageHeader } from "@/components/admin/ui";
import { publicIntegrations } from "@/lib/integrations/config";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default function AdminIntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Configure SMTP, payment gateway and Firebase. Secrets are encrypted on the server and never returned to the browser. Features that need these stay off until the matching product flow is wired."
      />
      <IntegrationsForm initial={publicIntegrations()} />
    </>
  );
}
