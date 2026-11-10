import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { AssistantNamesTable, type AssistantRow } from "@/components/admin/assistant-names";
import { Empty, Section, TableCard } from "@/components/admin/ui";
import { ModelsManager, type ModelRuntime } from "@/components/chat/models-manager";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { disabledModelNames } from "@/lib/db/queries";
import { MODEL_CATALOG } from "@/lib/model-catalog";
import { brandingOverrides } from "@/lib/models/branding-store";
import { getInventory, resolveModel, runtimeDetails } from "@/lib/ollama";
import { getPlans } from "@/lib/plans/config";
import { PLAN_IDS } from "@/lib/plans/types";
import { listSelectableModels } from "@/lib/providers/catalog";

export const metadata: Metadata = { title: "Models" };
export const dynamic = "force-dynamic";

const MONTH = 30 * 24 * 60 * 60 * 1000;

function localModelStats() {
  return db.all<{ model: string; calls: number; errors: number; avgMs: number | null; lastAt: number }>(sql`
    SELECT model, COUNT(*) AS calls, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
      CAST(AVG(CASE WHEN status = 'ok' THEN duration_ms END) AS INTEGER) AS avgMs, MAX(created_at) AS lastAt
    FROM usage_events WHERE agent_id = 'ollama' AND created_at >= ${Date.now() - MONTH} GROUP BY model
  `);
}

export default async function AdminModelsPage() {
  await requireAdmin();
  const [inventory, runtime, catalog] = await Promise.all([getInventory(), runtimeDetails(), listSelectableModels()]);
  const plans = getPlans();
  const disabled = disabledModelNames();
  const stats = localModelStats();
  const overrides = brandingOverrides();
  const models = inventory.ok ? inventory.models : [];
  const details: Record<string, ModelRuntime> = Object.fromEntries(
    models.map((model) => [
      model.name,
      {
        loaded: runtime?.loaded.find((item) => item.name === model.name) ?? null,
        enabled: !disabled.has(model.name),
        plans: PLAN_IDS.filter((id) => plans[id].allModels || plans[id].models.includes(`ollama\u001f${model.name}`)).map((id) => plans[id].name),
        stats: stats.find((row) => row.model === model.name) ?? null,
      },
    ]),
  );
  const assistants: AssistantRow[] = catalog.models.map((model) => ({
    key: model.key,
    modelId: model.modelId,
    providerName: model.providerName,
    defaultName: model.defaultName,
    name: model.name,
    description: model.description,
    override: overrides.get(model.key) ?? { displayName: null, description: null },
    capabilities: model.capabilities.map((capability) => capability.label),
  }));
  return (
    <>
      <ModelsManager
        admin
        installed={models}
        defaultModel={inventory.ok ? resolveModel(inventory.models) : null}
        ollamaError={inventory.ok ? null : inventory.error}
        catalog={MODEL_CATALOG}
        runtime={{ reachable: runtime !== null, version: runtime?.version ?? null, models: details, checkedAt: runtime?.checkedAt ?? 0 }}
      />
      <div id="names" className="mt-10 scroll-mt-4">
        <Section
          title="Customer-facing names"
          description="Customers see these names and descriptions instead of model IDs. Leave a field empty to use the generated one."
        >
          <TableCard>
            {assistants.length === 0 ? (
              <Empty>No assistants are available. Install or enable a model first.</Empty>
            ) : (
              <AssistantNamesTable rows={assistants} />
            )}
          </TableCard>
        </Section>
      </div>
    </>
  );
}
