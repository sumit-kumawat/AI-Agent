// Client-safe plan types and helpers.

export const PLAN_IDS = ["free", "basic", "advance"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const FEATURES = ["chat", "research", "ide"] as const;
export type Feature = (typeof FEATURES)[number];

export const WINDOWS = ["daily", "weekly", "monthly"] as const;
export type LimitWindow = (typeof WINDOWS)[number];

/** Token limits per window. 0 means unlimited, everywhere in the app. */
export type Limits = Record<LimitWindow, number>;

export type PlanConfig = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Null until an admin sets a price. Prices are never invented. */
  price: { amount: number; currency: string; interval: "month" | "year" } | null;
  /** Every installed model, including ones installed later. */
  allModels: boolean;
  /** Model keys (provider + model) included when allModels is off. */
  models: string[];
  limits: Limits;
  /** Extra limits for one model, by model key. */
  modelLimits: Record<string, Limits>;
  featureLimits: Record<Feature, Limits>;
  features: { attachments: boolean; research: boolean; ide: boolean; cloudModels: boolean };
  /** Megabytes; 0 means unlimited. */
  storageMb: { attachments: number; ide: number };
  /** Monthly usage resets on the 1st (calendar) or on the day the plan started (subscription). */
  period: "calendar" | "subscription";
};

export type UserLimitOverrides = Partial<Limits>;

export const PLAN_RANK: Record<PlanId, number> = { free: 0, basic: 1, advance: 2 };

export const WINDOW_LABEL: Record<LimitWindow, string> = { daily: "Today", weekly: "This week", monthly: "This month" };

export const FEATURE_LABEL: Record<Feature, string> = { chat: "Chat", research: "Deep Research", ide: "IDE assistant" };

export function isUnlimited(limit: number) {
  return limit === 0;
}

export function asPlanId(value: unknown): PlanId {
  return (PLAN_IDS as readonly unknown[]).includes(value) ? (value as PlanId) : "free";
}

/** A limit as people read it: "Unlimited" for 0. */
export function formatLimit(limit: number) {
  return isUnlimited(limit) ? "Unlimited" : limit.toLocaleString("en-US");
}

/** Reset times are UTC boundaries; shown in the reader's own time zone. */
export function formatReset(at: number) {
  return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Compact token counts: 1.2M, 350K. */
export function formatTokens(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPrice(price: PlanConfig["price"]) {
  if (!price) return null;
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency }).format(price.amount);
  return `${amount} / ${price.interval}`;
}

/** Usage state for one window, as the UI shows it. */
export type UsageWindow = {
  window: LimitWindow;
  used: number;
  limit: number;
  resetAt: number;
  /** Null when unlimited. */
  percent: number | null;
};

export type UsageSummary = {
  plan: { id: PlanId; name: string };
  /** Admins are not limited by plans. */
  staff: boolean;
  windows: UsageWindow[];
  /** Highest percentage across limited windows, null when nothing is limited. */
  peak: number | null;
  /** Usage that was estimated because the model did not report token counts. */
  estimatedTokens: number;
  /** Capabilities the plan does not include, with the upgrade that unlocks each. */
  locked: Partial<Record<"attachments" | "research" | "ide", PlanBlock>>;
};

/** Returned by the API when a plan blocks something; drives the upgrade prompt. */
export type PlanBlock = {
  code: "upgrade_required" | "limit_reached";
  message: string;
  requiredPlan: { id: PlanId; name: string } | null;
  resetAt?: number;
};
