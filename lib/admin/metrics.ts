import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { listSessions } from "@/lib/agents";
import { db, databaseFile, dataDirectory } from "@/lib/db";
import { workspacesRoot } from "@/lib/ide/paths";
import { folderBytes } from "@/lib/ide/workspaces";
import { getInventory, runningModels } from "@/lib/ollama";
import { paymentGatewayStatus } from "@/lib/integrations/config";
import { listProviders } from "@/lib/providers/store";

const DAY = 24 * 60 * 60 * 1000;

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function asRange(value: unknown): RangeDays {
  const days = Number(value);
  return (RANGES as readonly number[]).includes(days) ? (days as RangeDays) : 30;
}

type Unavailable = { available: false; reason: string };

/** CPU busy share over a short sample, from the kernel's per-core counters. */
async function cpuPercent(sampleMs = 250) {
  const totals = () =>
    os.cpus().reduce(
      (sum, cpu) => {
        const { user, nice, sys, irq, idle } = cpu.times;
        return { busy: sum.busy + user + nice + sys + irq, all: sum.all + user + nice + sys + irq + idle };
      },
      { busy: 0, all: 0 },
    );
  const start = totals();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = totals();
  const all = end.all - start.all;
  return all > 0 ? Math.round(((end.busy - start.busy) / all) * 1000) / 10 : null;
}

function fileSize(file: string) {
  return fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;
}

const storageCache = globalThis as typeof globalThis & { xaiStorage?: { at: number; value: StorageMetrics } };

type StorageMetrics = {
  databaseBytes: number;
  attachmentsBytes: number;
  workspacesBytes: number;
  disk: { totalBytes: number; freeBytes: number } | Unavailable;
};

/** Walking workspace folders is slow, so storage is measured at most once a minute. */
function storage(): StorageMetrics {
  const cached = storageCache.xaiStorage;
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  let disk: StorageMetrics["disk"];
  try {
    const stats = fs.statfsSync(dataDirectory);
    disk = { totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize };
  } catch (error) {
    disk = { available: false, reason: `The operating system did not report disk space (${(error as Error).message}).` };
  }
  const value = {
    databaseBytes: fileSize(databaseFile) + fileSize(`${databaseFile}-wal`) + fileSize(`${databaseFile}-shm`),
    attachmentsBytes: db.get<{ total: number }>(sql`SELECT COALESCE(SUM(size), 0) AS total FROM attachments`)?.total ?? 0,
    workspacesBytes: fs.existsSync(workspacesRoot) ? folderBytes(workspacesRoot) : 0,
    disk,
  };
  storageCache.xaiStorage = { at: Date.now(), value };
  return value;
}

function databaseHealth() {
  try {
    const started = performance.now();
    const check = db.get<{ quick_check: string }>(sql`PRAGMA quick_check(1)`);
    const journal = db.get<{ journal_mode: string }>(sql`PRAGMA journal_mode`);
    const version = db.get<{ user_version: number }>(sql`PRAGMA user_version`);
    return {
      ok: check?.quick_check === "ok",
      detail: check?.quick_check ?? "no answer",
      journalMode: journal?.journal_mode ?? null,
      schemaVersion: version?.user_version ?? null,
      checkMs: Math.round(performance.now() - started),
      file: path.basename(databaseFile),
    };
  } catch (error) {
    return { ok: false, detail: (error as Error).message, journalMode: null, schemaVersion: null, checkMs: null, file: path.basename(databaseFile) };
  }
}

/** Live host and service state; cheap enough to poll every few seconds. */
export async function systemMetrics() {
  const [cpu, inventory, running] = await Promise.all([
    cpuPercent(),
    (async () => {
      const started = performance.now();
      const result = await getInventory();
      return { result, ms: Math.round(performance.now() - started) };
    })(),
    runningModels().catch(() => null),
  ]);
  const memory = process.memoryUsage();
  const providers = listProviders();
  return {
    at: Date.now(),
    cpu: { percent: cpu, cores: os.cpus().length, load: process.platform === "win32" ? null : os.loadavg() },
    memory: { totalBytes: os.totalmem(), freeBytes: os.freemem(), processRssBytes: memory.rss, heapUsedBytes: memory.heapUsed },
    uptime: { systemSeconds: os.uptime(), processSeconds: Math.round(process.uptime()) },
    runtime: { node: process.version, platform: `${os.type()} ${os.release()}`, arch: os.arch() },
    database: databaseHealth(),
    storage: storage(),
    ollama: inventory.result.ok
      ? { ok: true as const, installed: inventory.result.models.length, loaded: running ? running.size : null, responseMs: inventory.ms }
      : { ok: false as const, error: inventory.result.error, responseMs: inventory.ms },
    providers: {
      enabled: providers.filter((provider) => provider.enabled).length,
      healthy: providers.filter((provider) => provider.enabled && provider.healthOk === true).length,
      failing: providers.filter((provider) => provider.enabled && provider.healthOk === false).map((provider) => provider.name),
      unchecked: providers.filter((provider) => provider.enabled && provider.healthOk === null).length,
    },
    jobs: {
      running: listSessions().length,
      byAgent: Object.entries(
        listSessions().reduce<Record<string, number>>((counts, session) => {
          counts[session.agentId] = (counts[session.agentId] ?? 0) + 1;
          return counts;
        }, {}),
      ).map(([agent, count]) => ({ agent, count })),
    },
  };
}

/** Every day in the range, oldest first, as YYYY-MM-DD in UTC. */
function days(range: RangeDays) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: range }, (_, index) => new Date(today.getTime() - (range - 1 - index) * DAY).toISOString().slice(0, 10));
}

function series<T extends { day: string }>(range: RangeDays, rows: T[], pick: (row: T) => number) {
  const byDay = new Map(rows.map((row) => [row.day, pick(row)]));
  return days(range).map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

/** Accounts, activity, usage and security over the chosen range, from the database. */
export function businessMetrics(range: RangeDays) {
  const now = Date.now();
  const since = new Date(days(range)[0]! + "T00:00:00Z").getTime();
  const day = (column: string) => sql.raw(`strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch')`);

  const users = db.get<{
    total: number;
    admins: number;
    suspended: number;
    active1: number;
    active7: number;
    active30: number;
    joined: number;
  }>(sql`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN role IN ('admin', 'superadmin') THEN 1 ELSE 0 END) AS admins,
      SUM(CASE WHEN suspended = 1 THEN 1 ELSE 0 END) AS suspended,
      SUM(CASE WHEN last_active_at >= ${now - DAY} THEN 1 ELSE 0 END) AS active1,
      SUM(CASE WHEN last_active_at >= ${now - 7 * DAY} THEN 1 ELSE 0 END) AS active7,
      SUM(CASE WHEN last_active_at >= ${now - 30 * DAY} THEN 1 ELSE 0 END) AS active30,
      SUM(CASE WHEN created_at >= ${since} THEN 1 ELSE 0 END) AS joined
    FROM users
  `)!;
  const registrations = db.all<{ day: string; count: number }>(sql`
    SELECT ${day("created_at")} AS day, COUNT(*) AS count FROM users WHERE created_at >= ${since} GROUP BY day
  `);
  const plans = db.all<{ plan: string; count: number }>(sql`SELECT plan, COUNT(*) AS count FROM users GROUP BY plan ORDER BY count DESC`);

  const requests = db.get<{
    calls: number;
    errors: number;
    blocked: number;
    aborted: number;
    inputTokens: number;
    outputTokens: number;
    estimated: number;
    avgMs: number | null;
    avgInput: number | null;
  }>(sql`
    SELECT COUNT(*) AS calls,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS aborted,
      COALESCE(SUM(input_tokens), 0) AS inputTokens,
      COALESCE(SUM(output_tokens), 0) AS outputTokens,
      SUM(CASE WHEN estimated = 1 THEN 1 ELSE 0 END) AS estimated,
      CAST(AVG(CASE WHEN status = 'ok' THEN duration_ms END) AS INTEGER) AS avgMs,
      CAST(AVG(CASE WHEN status = 'ok' THEN input_tokens END) AS INTEGER) AS avgInput
    FROM usage_events WHERE created_at >= ${since}
  `)!;
  const daily = db.all<{ day: string; calls: number; tokens: number; errors: number }>(sql`
    SELECT ${day("created_at")} AS day, COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
    FROM usage_events WHERE created_at >= ${since} GROUP BY day
  `);
  const features = db.all<{ feature: string; calls: number; tokens: number }>(sql`
    SELECT COALESCE(feature, 'chat') AS feature, COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens
    FROM usage_events WHERE created_at >= ${since} GROUP BY feature ORDER BY tokens DESC
  `);
  const topModels = db.all<{ model: string; calls: number; tokens: number }>(sql`
    SELECT model, COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens
    FROM usage_events WHERE created_at >= ${since} GROUP BY model ORDER BY calls DESC LIMIT 6
  `);

  const content = db.get<{ conversations: number; newConversations: number; messages: number; flagged: number; summarised: number }>(sql`
    SELECT (SELECT COUNT(*) FROM conversations) AS conversations,
      (SELECT COUNT(*) FROM conversations WHERE created_at >= ${since}) AS newConversations,
      (SELECT COUNT(*) FROM messages) AS messages,
      (SELECT COUNT(*) FROM messages WHERE flagged = 1) AS flagged,
      (SELECT COUNT(*) FROM conversations WHERE summary IS NOT NULL) AS summarised
  `)!;

  const security = db.get<{ failed: number; failed24: number; suspended: number; limited: number; rateLimits: number; since: number | null }>(sql`
    SELECT
      (SELECT COUNT(*) FROM security_events WHERE type = 'login_failed' AND created_at >= ${since}) AS failed,
      (SELECT COUNT(*) FROM security_events WHERE type = 'login_failed' AND created_at >= ${now - DAY}) AS failed24,
      (SELECT COUNT(*) FROM security_events WHERE type = 'login_suspended' AND created_at >= ${since}) AS suspended,
      (SELECT COUNT(*) FROM security_events WHERE type = 'login_rate_limited' AND created_at >= ${since}) AS limited,
      (SELECT COUNT(*) FROM rate_limit_events WHERE created_at >= ${since}) AS rateLimits,
      (SELECT MIN(created_at) FROM security_events) AS since
  `)!;
  const failedDaily = db.all<{ day: string; count: number }>(sql`
    SELECT ${day("created_at")} AS day, COUNT(*) AS count FROM security_events
    WHERE type = 'login_failed' AND created_at >= ${since} GROUP BY day
  `);
  const recentSecurity = db.all<{ id: number; type: string; email: string | null; ip: string | null; createdAt: number }>(sql`
    SELECT id, type, email, ip, created_at AS createdAt FROM security_events ORDER BY created_at DESC, id DESC LIMIT 8
  `);

  return {
    range,
    since,
    users: { ...users, registrations: series(range, registrations, (row) => row.count) },
    plans,
    payments: (() => {
      const status = paymentGatewayStatus();
      return status.connected
        ? { available: true as const, provider: status.provider, reason: status.reason }
        : { available: false as const, reason: status.reason };
    })(),
    requests: {
      ...requests,
      daily: series(range, daily, (row) => row.calls),
      tokensDaily: series(range, daily, (row) => row.tokens),
      errorsDaily: series(range, daily, (row) => row.errors),
      features,
      topModels,
    },
    content,
    security: { ...security, failedDaily: series(range, failedDaily, (row) => row.count), recent: recentSecurity },
  };
}

export type SystemMetrics = Awaited<ReturnType<typeof systemMetrics>>;
export type BusinessMetrics = ReturnType<typeof businessMetrics>;
