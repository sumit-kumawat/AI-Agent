type Bucket = { count: number; resetAt: number };

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

/**
 * Fixed-window limiter held in process memory. It is correct for a single
 * Node process; run several instances and each keeps its own counts.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const };
  }
  if (bucket.count >= limit) {
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
