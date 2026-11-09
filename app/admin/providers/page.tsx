import { ProvidersManager } from "@/components/admin/providers-manager";
import { PageHeader } from "@/components/admin/ui";
import { getRouting, publicProviders } from "@/lib/providers/store";
import { listSelectableModels } from "@/lib/providers/catalog";

export const metadata = { title: "Providers" };
export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const selectable = await listSelectableModels();
  return (
    <>
      <PageHeader
        title="Model providers"
        description="Keys stay on the server, encrypted. A provider's models appear in chat only after a connection check succeeds, and only the models you enable."
      />
      <ProvidersManager
        providers={publicProviders()}
        routing={getRouting()}
        selectable={selectable.models.map((model) => ({
          providerId: model.providerId,
          modelId: model.modelId,
          providerName: model.providerName,
          local: model.local,
        }))}
      />
    </>
  );
}
