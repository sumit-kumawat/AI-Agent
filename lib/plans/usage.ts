import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { usageEvents, type users } from "@/lib/db/schema";
import { getPlans } from "@/lib/plans/config";
import {
  PLAN_IDS,
  PLAN_RANK,
  WINDOWS,
  asPlanId,
  formatLimit,
  isUnlimited,
  type Feature,
  type LimitWindow,
  type Limits,
  type PlanBlock,
  type PlanConfig,
  type UsageSummary,
  type UsageWindow,
  type UserLimitOverrides,
} from "@/lib/plans/types";
import { isStaff } from "@/lib/roles";

type UserRow = typeof users.$inferSelect;

const DAY = 24 * 60 * 60 * 1000;

/** Window boundaries in UTC: days start at 00:00, weeks on Monday, months on the 1st or the plan's start day. */
export function windowBounds(window: LimitWindow, plan: PlanConfig, planStartedAt: number | null, now = Date.now()) {
  const date = new Date(now);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (window === "daily") return { start: today, end: today + DAY };
  if (window === "weekly") {
    const start = today - ((date.getUTCDay() + 6) % 7) * DAY;
    return { start, end: start + 7 * DAY };
  }
  const anchorDay = plan.period === "subscription" && planStartedAt ? new Date(planStartedAt).getUTCDate() : 1;
  const monthStart = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(year, month, Math.min(anchorDay, last));
  };
  let start = monthStart(date.getUTCFullYear(), date.getUTCMonth());
  if (start > now) start = monthStart(date.getUTCFullYear(), date.getUTCMonth() - 1);
  const startDate = new Date(start);
  return { start, end: monthStart(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1) };
}

export function overridesOf(user: Pick<UserRow, "limitOverrides">): UserLimitOverrides {
  if (!user.limitOverrides) return {};
  try {
    const value = JSON.parse(user.limitOverrides) as Record<string, unknown>;
    return Object.fromEntries(
      WINDOWS.filter((window) => Number.isInteger(value[window]) && (value[window] as number) >= 0).map((window) => [
        window,
        value[window] as number,
      ]),
    );
  } catch {
    return {};
  }
}

export function planOf(user: Pick<UserRow, "plan">) {
  return getPlans()[asPlanId(user.plan)];
}

/** The plan's total limits with the user's personal overrides applied. */
export function effectiveLimits(user: UserRow): Limits {
  const plan = planOf(user);
  return { ...plan.limits, ...overridesOf(user) };
}

function usedSince(userId: string, since: number, filter?: { model?: string; feature?: Feature }) {
  const conditions = [eq(usageEvents.userId, userId), gte(usageEvents.createdAt, since), ne(usageEvents.status, "blocked")];
  if (filter?.model) conditions.push(eq(usageEvents.model, filter.model));
  if (filter?.feature) conditions.push(eq(usageEvents.feature, filter.feature));
  return (
    db
      .select({ total: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)` })
      .from(usageEvents)
      .where(and(...conditions))
      .get()?.total ?? 0
  );
}

function windowsFor(user: UserRow, limits: Limits, filter?: { model?: string; feature?: Feature }): UsageWindow[] {
  const plan = planOf(user);
  return WINDOWS.map((window) => {
    const { start, end } = windowBounds(window, plan, user.planStartedAt);
    const used = usedSince(user.id, start, filter);
    const limit = limits[window];
    return { window, used, limit, resetAt: end, percent: isUnlimited(limit) ? null : Math.min(100, Math.round((used / limit) * 100)) };
  });
}

export function usageSummary(user: UserRow): Omit<UsageSummary, "locked"> {
  const plan = planOf(user);
  const staff = isStaff(user.role);
  const windows = windowsFor(user, staff ? { daily: 0, weekly: 0, monthly: 0 } : effectiveLimits(user));
  const limited = windows.filter((window) => window.percent !== null).map((window) => window.percent!);
  const month = windowBounds("monthly", plan, user.planStartedAt);
  const estimatedTokens =
    db
      .select({ total: sql<number>`COALESCE(SUM(${usageEvents.totalTokens}), 0)` })
      .from(usageEvents)
      .where(and(eq(usageEvents.userId, user.id), gte(usageEvents.createdAt, month.start), eq(usageEvents.estimated, true)))
      .get()?.total ?? 0;
  return {
    plan: { id: plan.id, name: plan.name },
    staff,
    windows,
    peak: limited.length ? Math.max(...limited) : null,
    estimatedTokens,
  };
}

/** The next plan up whose limit for this scope is higher, or unlimited. */
function upgradeFor(current: PlanConfig, limitOf: (plan: PlanConfig) => number, currentLimit: number) {
  const plans = getPlans();
  for (const id of PLAN_IDS) {
    if (PLAN_RANK[id] <= PLAN_RANK[current.id]) continue;
    const limit = limitOf(plans[id]);
    if (isUnlimited(limit) || limit > currentLimit) return { id, name: plans[id].name };
  }
  return null;
}

const WINDOW_NOUN: Record<LimitWindow, string> = { daily: "daily", weekly: "weekly", monthly: "monthly" };

export type Allowance =
  | { ok: true; /** Tokens left in the tightest window; null when nothing limits this request. */ remaining: number | null }
  | { ok: false; block: PlanBlock };

/**
 * Checks the plan, personal, per-model and per-feature limits before a request.
 * A request that starts within the allowance may finish slightly over it; the
 * caller caps output tokens to `remaining` to keep that small.
 */
export function checkAllowance(user: UserRow, request: { model: string; feature: Feature }): Allowance {
  if (isStaff(user.role)) return { ok: true, remaining: null };
  const plan = planOf(user);
  const scopes: { label: string; limits: Limits; filter?: { model?: string; feature?: Feature }; limitOf: (plan: PlanConfig, window: LimitWindow) => number }[] = [
    { label: "", limits: effectiveLimits(user), limitOf: (candidate, window) => candidate.limits[window] },
  ];
  const modelKey = Object.keys(plan.modelLimits).find((key) => key === request.model || key.endsWith(`\u001f${request.model}`));
  if (modelKey) {
    scopes.push({
      label: ` for ${request.model}`,
      limits: plan.modelLimits[modelKey]!,
      filter: { model: request.model },
      limitOf: (candidate, window) => candidate.modelLimits[modelKey]?.[window] ?? 0,
    });
  }
  scopes.push({
    label: request.feature === "chat" ? " for chat" : request.feature === "research" ? " for Deep Research" : " for the IDE assistant",
    limits: plan.featureLimits[request.feature],
    filter: { feature: request.feature },
    limitOf: (candidate, window) => candidate.featureLimits[request.feature][window],
  });

  let remaining: number | null = null;
  for (const scope of scopes) {
    for (const usage of windowsFor(user, scope.limits, scope.filter)) {
      if (isUnlimited(usage.limit)) continue;
      const left = usage.limit - usage.used;
      if (left <= 0) {
        const requiredPlan = upgradeFor(plan, (candidate) => scope.limitOf(candidate, usage.window), usage.limit);
        return {
          ok: false,
          block: {
            code: "limit_reached",
            message: `You have used your ${WINDOW_NOUN[usage.window]} allowance of ${formatLimit(usage.limit)} tokens${scope.label} on the ${plan.name} plan. It resets ${new Date(usage.resetAt).toISOString().slice(0, 16).replace("T", " ")} UTC.`,
            requiredPlan,
            resetAt: usage.resetAt,
          },
        };
      }
      remaining = remaining === null ? left : Math.min(remaining, left);
    }
  }
  return { ok: true, remaining };
}

/** Tokens per model and per feature in the current monthly window, for the usage page. */
export function usageBreakdown(user: UserRow) {
  const plan = planOf(user);
  const { start } = windowBounds("monthly", plan, user.planStartedAt);
  const scope = and(eq(usageEvents.userId, user.id), gte(usageEvents.createdAt, start), ne(usageEvents.status, "blocked"));
  const byModel = db
    .select({
      model: usageEvents.model,
      input: sql<number>`SUM(${usageEvents.inputTokens})`,
      output: sql<number>`SUM(${usageEvents.outputTokens})`,
      total: sql<number>`SUM(${usageEvents.totalTokens})`,
      requests: sql<number>`COUNT(*)`,
    })
    .from(usageEvents)
    .where(scope)
    .groupBy(usageEvents.model)
    .orderBy(sql`SUM(${usageEvents.totalTokens}) DESC`)
    .all();
  const byFeature = db
    .select({ feature: usageEvents.feature, total: sql<number>`SUM(${usageEvents.totalTokens})` })
    .from(usageEvents)
    .where(scope)
    .groupBy(usageEvents.feature)
    .all();
  return { since: start, byModel, byFeature };
}
