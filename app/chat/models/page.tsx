import type { Metadata } from "next";
import { ModelsManager } from "@/components/chat/models-manager";
import { isAdmin } from "@/lib/admin";
import { MODEL_CATALOG } from "@/lib/model-catalog";
import { getInventory, resolveModel } from "@/lib/ollama";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Models" };
export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const user = await requireUser();
  const inventory = await getInventory();

  return (
    <ModelsManager
      admin={isAdmin(user)}
      installed={inventory.ok ? inventory.models : []}
      defaultModel={inventory.ok ? resolveModel(inventory.models) : null}
      ollamaError={inventory.ok ? null : inventory.error}
      catalog={MODEL_CATALOG}
    />
  );
}
