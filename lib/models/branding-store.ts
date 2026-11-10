import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modelBranding } from "@/lib/db/schema";
import type { ModelOption } from "@/lib/model-ref";
import { defaultAssistantDescription, defaultAssistantName, uniqueNames } from "@/lib/models/branding";

export type BrandingOverride = { displayName: string | null; description: string | null };

export function brandingOverrides() {
  const rows = db.select().from(modelBranding).all();
  return new Map<string, BrandingOverride>(rows.map((row) => [row.key, { displayName: row.displayName, description: row.description }]));
}

export function saveBranding(key: string, value: BrandingOverride) {
  if (!value.displayName && !value.description) {
    db.delete(modelBranding).where(eq(modelBranding.key, key)).run();
    return;
  }
  db.insert(modelBranding)
    .values({ key, ...value, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: modelBranding.key, set: { ...value, updatedAt: Date.now() } })
    .run();
}

type Unbranded = Omit<ModelOption, "name" | "description" | "defaultName">;

/**
 * Names every model for customers. Generated names are made unique in key
 * order, so they do not shift when the model list is reordered.
 */
export function applyBranding(models: Unbranded[]): ModelOption[] {
  const overrides = brandingOverrides();
  const order = models.map((_, index) => index).sort((a, b) => models[a]!.key.localeCompare(models[b]!.key));
  const generated = uniqueNames(order.map((index) => defaultAssistantName(models[index]!)));
  const defaults = new Map(order.map((index, position) => [models[index]!.key, generated[position]!]));
  return models.map((model) => {
    const override = overrides.get(model.key);
    const defaultName = defaults.get(model.key)!;
    return {
      ...model,
      defaultName,
      name: override?.displayName || defaultName,
      description:
        override?.description ||
        defaultAssistantDescription({ ...model, capabilityIds: model.capabilities.map((capability) => capability.id) }),
    };
  });
}
