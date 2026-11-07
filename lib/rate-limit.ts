import { db } from "@/lib/db";
import { rateLimitEvents } from "@/lib/db/schema";

type Bucket = { count: number; resetAt: number; logged: boolean };

export type LimitContext = {
  endpoint: string;
  userId?: string | null;
  ip?: string | null;
};

const store = globalThis as typeof globalThis & {
  harborRateLimits?: Map<string, Bucket>;
};

const buckets = (store.harborRateLimits ??= new Map<string, Bucket>());

function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function logHit(key: string, context: LimitContext) {
  try {
    db.insert(rateLimitEvents)
      .values({
        userId: context.userId ?? null,
        ip: context.ip ?? null,
        endpoint: context.endpoint,
        limitKey: key,
        createdAt: Date.now(),
      })
      .run();
  } catch (error) {
    console.error("Failed to record a rate-limit hit", error);
  }
}

/**
 * Fixed-window limiter held in process memory. It is correct for a single
 * Node process; run several instances and each keeps its own counts.
 * The first rejection in each window is written to the rate-limit log.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  context?: LimitContext,
) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs, logged: false });
    return { ok: true as const };
  }
  if (bucket.count >= limit) {
    if (context && !bucket.logged) {
      bucket.logged = true;
      logHit(key, context);
    }
    return {
      ok: false as const,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count += 1;
  return { ok: true as const };
}

/**
 * Returns the caller's address as reported by a reverse proxy, or null when
 * the app is reached directly. Without a proxy every request looks the same,
 * so per-IP limits would turn into one global limit shared by all users.
 */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}

export function tooManyRequests(retryAfter: number) {
  return Response.json(
    { error: "Too many requests. Wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
