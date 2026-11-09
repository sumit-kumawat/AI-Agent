import type { Metadata } from "next";
import { ModelsManager } from "@/components/chat/models-manager";
import { MODEL_CATALOG } from "@/lib/model-catalog";
import { getInventory, resolveModel } from "@/lib/ollama";

export const metadata: Metadata = { title: "Models" };
export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const inventory = await getInventory();
  return (
    <ModelsManager
      admin
      installed={inventory.ok ? inventory.models : []}
      defaultModel={inventory.ok ? resolveModel(inventory.models) : null}
      ollamaError={inventory.ok ? null : inventory.error}
      catalog={MODEL_CATALOG}
    />
  );
}
