import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { creativeJobs } from "@/lib/db/schema";
import type { CreativeJobKind, CreativeJobRow, CreativeJobStatus } from "@/lib/creative/types";

const LOCK_STALE_MS = 60_000;

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapJob(row: typeof creativeJobs.$inferSelect): CreativeJobRow {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    status: row.status,
    progress: row.progress,
    worker: row.worker,
    error: row.error,
    payload: parseJson(row.payload),
    result: parseJson(row.result),
    lockedAt: row.lockedAt,
    heartbeatAt: row.heartbeatAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export function enqueueJob(input: {
  userId: string;
  kind: CreativeJobKind | string;
  payload?: Record<string, unknown>;
}) {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.insert(creativeJobs)
    .values({
      id,
      userId: input.userId,
      kind: input.kind,
      status: "queued",
      progress: 0,
      payload: JSON.stringify(input.payload ?? {}),
      result: "{}",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getJob(id)!;
}

export function getJob(id: string) {
  const row = db.select().from(creativeJobs).where(eq(creativeJobs.id, id)).get();
  return row ? mapJob(row) : null;
}

export function getJobForUser(id: string, userId: string) {
  const row = db
    .select()
    .from(creativeJobs)
    .where(and(eq(creativeJobs.id, id), eq(creativeJobs.userId, userId)))
    .get();
  return row ? mapJob(row) : null;
}

export function listJobsForUser(userId: string, limit = 50) {
  return db
    .select()
    .from(creativeJobs)
    .where(eq(creativeJobs.userId, userId))
    .orderBy(desc(creativeJobs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200))
    .all()
    .map(mapJob);
}

export function cancelJob(id: string, userId: string) {
  const job = getJobForUser(id, userId);
  if (!job) return null;
  if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") return job;
  const now = Date.now();
  db.update(creativeJobs)
    .set({
      status: "cancelled",
      error: "Cancelled by user.",
      updatedAt: now,
      finishedAt: now,
      lockedAt: null,
      worker: null,
    })
    .where(eq(creativeJobs.id, id))
    .run();
  return getJob(id);
}

export function retryJob(id: string, userId: string) {
  const job = getJobForUser(id, userId);
  if (!job) return null;
  if (job.status !== "failed" && job.status !== "cancelled") return job;
  const now = Date.now();
  db.update(creativeJobs)
    .set({
      status: "queued",
      progress: 0,
      error: null,
      result: "{}",
      worker: null,
      lockedAt: null,
      heartbeatAt: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    })
    .where(eq(creativeJobs.id, id))
    .run();
  return getJob(id);
}

/** Claim the next queued job (or a stale lock) for a worker. */
export function claimNextJob(workerId: string) {
  const now = Date.now();
  const staleBefore = now - LOCK_STALE_MS;
  return db.transaction((tx) => {
    const candidate = tx
      .select()
      .from(creativeJobs)
      .where(
        or(
          eq(creativeJobs.status, "queued"),
          and(
            eq(creativeJobs.status, "running"),
            or(isNull(creativeJobs.heartbeatAt), lt(creativeJobs.heartbeatAt, staleBefore)),
          ),
        ),
      )
      .orderBy(creativeJobs.createdAt)
      .limit(1)
      .get();
    if (!candidate) return null;
    tx.update(creativeJobs)
      .set({
        status: "running",
        worker: workerId,
        lockedAt: now,
        heartbeatAt: now,
        startedAt: candidate.startedAt ?? now,
        updatedAt: now,
        error: null,
      })
      .where(eq(creativeJobs.id, candidate.id))
      .run();
    const row = tx.select().from(creativeJobs).where(eq(creativeJobs.id, candidate.id)).get();
    return row ? mapJob(row) : null;
  });
}

export function heartbeatJob(id: string, workerId: string, progress?: number) {
  const job = getJob(id);
  if (!job || job.worker !== workerId || job.status !== "running") return null;
  const now = Date.now();
  // Never invent progress: only accept an explicit worker-reported value in [0, 1].
  const nextProgress =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.min(1, Math.max(0, progress))
      : job.progress;
  db.update(creativeJobs)
    .set({ heartbeatAt: now, updatedAt: now, progress: nextProgress })
    .where(and(eq(creativeJobs.id, id), eq(creativeJobs.worker, workerId)))
    .run();
  return getJob(id);
}

export function finishJob(
  id: string,
  workerId: string,
  outcome: { status: Extract<CreativeJobStatus, "succeeded" | "failed">; error?: string; result?: Record<string, unknown> },
) {
  const job = getJob(id);
  if (!job || job.worker !== workerId) return null;
  const now = Date.now();
  db.update(creativeJobs)
    .set({
      status: outcome.status,
      error: outcome.error ?? null,
      result: JSON.stringify(outcome.result ?? {}),
      progress: outcome.status === "succeeded" ? 1 : job.progress,
      finishedAt: now,
      updatedAt: now,
      lockedAt: null,
    })
    .where(eq(creativeJobs.id, id))
    .run();
  return getJob(id);
}

export function failMissingEngine(id: string, workerId: string, engine: string) {
  return finishJob(id, workerId, {
    status: "failed",
    error: `Engine missing: ${engine}. Install or configure it in Creative Settings, then retry.`,
  });
}

export function queuedKinds(kinds: string[]) {
  if (!kinds.length) return 0;
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(creativeJobs)
    .where(and(inArray(creativeJobs.kind, kinds), eq(creativeJobs.status, "queued")))
    .get();
  return row?.count ?? 0;
}
