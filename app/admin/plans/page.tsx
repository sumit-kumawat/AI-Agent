import { PlansEditor } from "@/components/admin/plans-editor";
import { PageHeader } from "@/components/admin/ui";
import { getPlans } from "@/lib/plans/config";
import { listSelectableModels } from "@/lib/providers/catalog";

export const metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const { models } = await listSelectableModels();
  return (
    <>
      <PageHeader
        title="Plans"
        description="Models, token allowances and features for each plan. A limit of 0 means unlimited. Changes apply to every account on the plan at once and are recorded in the audit log."
      />
      <PlansEditor
        initial={getPlans()}
        models={models.map((model) => ({ key: model.key, name: model.name, provider: model.providerName, local: model.local }))}
      />
    </>
  );
}
