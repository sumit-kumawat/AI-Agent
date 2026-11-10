import type { users } from "@/lib/db/schema";
import { modelKey, type ModelOption } from "@/lib/model-ref";
import { getUserInventory } from "@/lib/ollama";
import { getPlans, lowestPlanWhere } from "@/lib/plans/config";
import { PLAN_IDS, type PlanBlock, type PlanConfig, type UsageSummary } from "@/lib/plans/types";
import { planOf, usageSummary } from "@/lib/plans/usage";
import { listSelectableModels } from "@/lib/providers/catalog";
import { isStaff } from "@/lib/roles";

type UserRow = typeof users.$inferSelect;

export function planIncludes(plan: PlanConfig, model: Pick<ModelOption, "key" | "local">) {
  if (!model.local && !plan.features.cloudModels) return false;
  return plan.allModels || plan.models.includes(model.key);
}

/**
 * The models this user may see and use. Installed models outside the plan stay
 * installed; they are only left out of everything this user is sent. Admins see all.
 */
export async function modelsForUser(user: UserRow) {
  const catalog = await listSelectableModels();
  if (isStaff(user.role)) return catalog;
  const plan = planOf(user);
  const models = catalog.models.filter((model) => planIncludes(plan, model));
  const warning =
    catalog.models.length > 0 && models.length === 0
      ? `Your ${plan.name} plan has no assistants available right now. An administrator can add them.`
      : catalog.warning
        ? "Assistants are temporarily unavailable. Try again in a few minutes."
        : null;
  return { models, warning };
}

/** Installed Ollama models this user's plan includes (admins: every enabled one). */
export async function inventoryForUser(user: UserRow) {
  const inventory = await getUserInventory();
  if (!inventory.ok || isStaff(user.role)) return inventory;
  const plan = planOf(user);
  return {
    ok: true as const,
    models: inventory.models.filter((model) => planIncludes(plan, { key: modelKey("ollama", model.name), local: true })),
  };
}

/** Why `model` is not available to this user, naming the plan that unlocks it. */
export function modelBlock(user: UserRow, model: ModelOption): PlanBlock | null {
  if (isStaff(user.role) || planIncludes(planOf(user), model)) return null;
  const requiredPlan = lowestPlanWhere((plan) => planIncludes(plan, model));
  return {
    code: "upgrade_required",
    message: requiredPlan
      ? `That model needs the ${requiredPlan.name} plan.`
      : "That model is not included in any plan right now.",
    requiredPlan: requiredPlan ? { id: requiredPlan.id, name: requiredPlan.name } : null,
  };
}

const CAPABILITY_LABEL = {
  attachments: "Attaching files",
  research: "Deep Research",
  ide: "The IDE",
  cloudModels: "Cloud models",
} as const;

export type Capability = keyof typeof CAPABILITY_LABEL;

export function capabilityBlock(user: UserRow, capability: Capability): PlanBlock | null {
  if (isStaff(user.role) || planOf(user).features[capability]) return null;
  const requiredPlan = lowestPlanWhere((plan) => plan.features[capability]);
  return {
    code: "upgrade_required",
    message: requiredPlan
      ? `${CAPABILITY_LABEL[capability]} needs the ${requiredPlan.name} plan.`
      : `${CAPABILITY_LABEL[capability]} is not included in any plan right now.`,
    requiredPlan: requiredPlan ? { id: requiredPlan.id, name: requiredPlan.name } : null,
  };
}

/** Usage plus locked capabilities: everything the app frame shows about the plan. */
export function accountSummary(user: UserRow): UsageSummary {
  const locked: UsageSummary["locked"] = {};
  for (const capability of ["attachments", "research", "ide"] as const) {
    const block = capabilityBlock(user, capability);
    if (block) locked[capability] = block;
  }
  return { ...usageSummary(user), locked };
}

/** Storage cap in bytes for this user; null when unlimited. */
export function storageLimit(user: UserRow, kind: "attachments" | "ide") {
  if (isStaff(user.role)) return null;
  const megabytes = planOf(user).storageMb[kind];
  return megabytes === 0 ? null : megabytes * 1024 * 1024;
}

/** Plan comparison data for customers: limits and features, plus model counts rather than names of models they cannot use. */
export async function planComparison(user: UserRow) {
  const catalog = await listSelectableModels();
  const plans = getPlans();
  const current = planOf(user);
  return PLAN_IDS.map((id) => {
    const plan = plans[id];
    const included = catalog.models.filter((model) => planIncludes(plan, model));
    const visible = isStaff(user.role) || id === current.id;
    return {
      id,
      name: plan.name,
      tagline: plan.tagline,
      price: plan.price,
      limits: plan.limits,
      featureLimits: plan.featureLimits,
      features: plan.features,
      storageMb: plan.storageMb,
      modelCount: included.length,
      skills: [...new Set(included.flatMap((model) => model.skills))],
      vision: included.some((model) => model.vision),
      models: visible ? included.map((model) => model.name) : null,
      current: id === current.id,
    };
  });
}
