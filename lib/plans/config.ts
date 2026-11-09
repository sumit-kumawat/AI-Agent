import { z } from "zod";
import { getSettingValue, setSettingValue } from "@/lib/settings";
import { FEATURES, PLAN_IDS, type Feature, type Limits, type PlanConfig, type PlanId } from "@/lib/plans/types";

const KEY = "plans.config";

const limitValue = z.number().int().min(0).max(10_000_000_000);
const limitsSchema = z.object({ daily: limitValue, weekly: limitValue, monthly: limitValue });

const planSchema = z.object({
  name: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(160),
  price: z
    .object({
      amount: z.number().min(0).max(1_000_000),
      currency: z.string().regex(/^[A-Z]{3}$/),
      interval: z.enum(["month", "year"]),
    })
    .nullable(),
  allModels: z.boolean(),
  models: z.array(z.string().min(1).max(300)).max(500),
  limits: limitsSchema,
  modelLimits: z.record(z.string().min(1).max(300), limitsSchema),
  featureLimits: z.object(Object.fromEntries(FEATURES.map((feature) => [feature, limitsSchema])) as Record<Feature, typeof limitsSchema>),
  features: z.object({ attachments: z.boolean(), research: z.boolean(), ide: z.boolean(), cloudModels: z.boolean() }),
  storageMb: z.object({ attachments: z.number().int().min(0).max(10_000_000), ide: z.number().int().min(0).max(10_000_000) }),
  period: z.enum(["calendar", "subscription"]),
});

export const plansSchema = z.object({
  free: planSchema,
  basic: planSchema,
  advance: planSchema,
});

const none: Limits = { daily: 0, weekly: 0, monthly: 0 };
const ollama = (name: string) => `ollama\u001f${name}`;
const SMALL = ["qwen2.5:1.5b", "gemma3:1b", "llama3.2:1b", "llama3.2:3b"].map(ollama);
const MID = ["deepseek-r1:1.5b", "gemma3:4b", "qwen2.5-coder:1.5b"].map(ollama);

/**
 * Starting points sized for one server running local models: they cover heavy
 * daily use (history is re-sent every turn, so input dominates) without
 * promising more than the hardware can generate. Admins change all of it.
 */
export const DEFAULT_PLANS: Record<PlanId, Omit<PlanConfig, "id">> = {
  free: {
    name: "Free",
    tagline: "Everyday chat with fast local models.",
    price: null,
    allModels: false,
    models: SMALL,
    limits: { daily: 200_000, weekly: 1_000_000, monthly: 3_000_000 },
    modelLimits: {},
    featureLimits: { chat: none, research: none, ide: { daily: 50_000, weekly: 0, monthly: 0 } },
    features: { attachments: true, research: false, ide: true, cloudModels: false },
    storageMb: { attachments: 100, ide: 50 },
    period: "calendar",
  },
  basic: {
    name: "Basic",
    tagline: "Reasoning, coding and vision models, Deep Research and more room.",
    price: null,
    allModels: false,
    models: [...SMALL, ...MID],
    limits: { daily: 1_000_000, weekly: 5_000_000, monthly: 20_000_000 },
    modelLimits: {},
    featureLimits: { chat: none, research: { daily: 300_000, weekly: 0, monthly: 0 }, ide: none },
    features: { attachments: true, research: true, ide: true, cloudModels: false },
    storageMb: { attachments: 1024, ide: 500 },
    period: "subscription",
  },
  advance: {
    name: "Advance",
    tagline: "Every model, including the largest and future ones, with the highest limits.",
    price: null,
    allModels: true,
    models: [],
    limits: { daily: 0, weekly: 0, monthly: 100_000_000 },
    modelLimits: {},
    featureLimits: { chat: none, research: none, ide: none },
    features: { attachments: true, research: true, ide: true, cloudModels: true },
    storageMb: { attachments: 10_240, ide: 5_120 },
    period: "subscription",
  },
};

export function getPlans(): Record<PlanId, PlanConfig> {
  const stored = getSettingValue(KEY);
  let parsed: z.infer<typeof plansSchema> | null = null;
  if (stored) {
    try {
      const result = plansSchema.safeParse(JSON.parse(stored));
      if (result.success) parsed = result.data;
    } catch {
      parsed = null;
    }
  }
  const source = parsed ?? DEFAULT_PLANS;
  return Object.fromEntries(PLAN_IDS.map((id) => [id, { ...source[id], id }])) as Record<PlanId, PlanConfig>;
}

export function getPlan(id: PlanId) {
  return getPlans()[id];
}

export function savePlans(input: unknown): { ok: true; plans: Record<PlanId, PlanConfig> } | { ok: false; error: string } {
  const parsed = plansSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Check ${issue?.path.join(" › ") || "the plans"}: ${issue?.message ?? "invalid value"}.` };
  }
  setSettingValue(KEY, JSON.stringify(parsed.data));
  return { ok: true, plans: getPlans() };
}

/** The cheapest plan that passes `test`, for upgrade prompts. */
export function lowestPlanWhere(test: (plan: PlanConfig) => boolean) {
  const plans = getPlans();
  for (const id of PLAN_IDS) if (test(plans[id])) return plans[id];
  return null;
}
