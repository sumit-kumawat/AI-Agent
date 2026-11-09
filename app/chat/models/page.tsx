import type { Metadata } from "next";
import { ModelsManager } from "@/components/chat/models-manager";
import { isAdmin } from "@/lib/admin";
import { MODEL_CATALOG } from "@/lib/model-catalog";
import { redirect } from "next/navigation";
import { findUserById } from "@/lib/db/queries";
import { getInventory, resolveModel } from "@/lib/ollama";
import { inventoryForUser } from "@/lib/plans/entitlements";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Models" };
export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const sessionUser = await requireUser();
  const user = findUserById(sessionUser.id!);
  if (!user) redirect("/login");
  const admin = isAdmin(user);
  const inventory = admin ? await getInventory() : await inventoryForUser(user);

  return (
    <ModelsManager
      admin={admin}
      installed={inventory.ok ? inventory.models : []}
      defaultModel={inventory.ok ? resolveModel(inventory.models) : null}
      ollamaError={inventory.ok ? null : inventory.error}
      catalog={MODEL_CATALOG}
    />
  );
}
