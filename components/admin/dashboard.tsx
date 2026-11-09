"use client";

import {
  Activity,
  AlertTriangle,
  Ban,
  Boxes,
  Cpu,
  CreditCard,
  Database,
  HardDrive,
  KeyRound,
  Loader2,
  MemoryStick,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { BusinessMetrics, RangeDays, SystemMetrics } from "@/lib/admin/metrics";
import { formatAgo, formatBytes, formatCompact, formatNumber } from "@/lib/format";

type Data = { system: SystemMetrics; business: BusinessMetrics };

const POLL_MS = 15_000;
const RANGES: RangeDays[] = [7, 30, 90];

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function Card({ icon: Icon, label, value, hint, tone, id }: { icon: LucideIcon; label: string; value: ReactNode; hint?: ReactNode; tone?: "bad" | "warn"; id?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-metric={id}>
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className={`mt-2 font-heading text-2xl ${tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return (
    <span className="text-base text-muted-foreground" data-unavailable>
      {children}
    </span>
  );
}

function Meter({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span
        className={`block h-full rounded-full ${value >= 90 ? "bg-destructive" : value >= 75 ? "bg-amber-500" : "bg-primary"}`}
        style={{ width: `${Math.min(100, Math.max(1, value))}%` }}
      />
    </span>
  );
}

/** Daily bars; every day in the range is drawn, so empty days show as gaps rather than disappearing. */
function Bars({ points, label, format = formatNumber }: { points: { day: string; value: number }[]; label: string; format?: (value: number) => string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const width = 100 / points.length;
  return (
    <figure className="rounded-xl border bg-card p-4" data-chart={label}>
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{format(total)} total</span>
      </figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-28 w-full" role="img" aria-label={`${label} per day`}>
        {points.map((point, index) => {
          const height = (point.value / max) * 38;
          return (
            <rect key={point.day} x={index * width + width * 0.15} y={40 - height} width={width * 0.7} height={Math.max(point.value ? 0.6 : 0, height)} className="fill-primary/80">
              <title>{`${point.day}: ${format(point.value)}`}</title>
            </rect>
          );
        })}
        <line x1="0" y1="39.8" x2="100" y2="39.8" className="stroke-border" strokeWidth="0.4" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.day}</span>
        <span>{points.at(-1)?.day}</span>
      </div>
    </figure>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing recorded in this range.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{row.label}</span>
                <span className="shrink-0 text-muted-foreground">{row.hint ?? formatNumber(row.value)}</span>
              </div>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(row.value / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Heading({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-baseline justify-between gap-2">
      <h2 className="text-base font-medium">{children}</h2>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

const SECURITY_LABEL: Record<string, string> = {
  login_failed: "Failed sign-in",
  login_suspended: "Suspended account tried to sign in",
  login_rate_limited: "Sign-in rate limited",
};

export function Dashboard({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [range, setRange] = useState<RangeDays>(initial.business.range);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async (days: RangeDays) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/metrics?range=${days}`, { cache: "no-store" });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${response.status}`);
      setData((await response.json()) as Data);
      setError(null);
    } catch (failure) {
      setError(`Live update failed: ${(failure as Error).message}. Showing the last values received.`);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(range);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, range, refresh]);

  const { system, business } = data;
  const memoryUsed = system.memory.totalBytes - system.memory.freeBytes;
  const memoryPercent = percent(memoryUsed, system.memory.totalBytes);
  const disk = "available" in system.storage.disk ? null : system.storage.disk;
  const diskPercent = disk ? percent(disk.totalBytes - disk.freeBytes, disk.totalBytes) : null;
  const { requests, users, security, content } = business;
  const errorRate = percent(requests.errors, requests.calls);

  return (
    <div data-dashboard>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Measured from the database and this server. Updated {formatAgo(system.at)}
            {live ? `, refreshing every ${POLL_MS / 1000}s` : ", live updates paused"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Range">
            {RANGES.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  setRange(days);
                  void refresh(days);
                }}
                aria-pressed={range === days}
                data-range={days}
                className={`rounded-md px-2.5 py-1 text-xs ${range === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {days} days
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLive((on) => !on)}
            className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
            aria-label={live ? "Pause live updates" : "Resume live updates"}
            title={live ? "Pause live updates" : "Resume live updates"}
          >
            {live ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => void refresh(range)}
            className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
            aria-label="Refresh now"
            title="Refresh now"
            data-refresh
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </button>
        </div>
      </div>
      {error ? <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <Heading detail={`Last ${range} days`}>Accounts</Heading>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card id="users" icon={Users} label="Users" value={formatNumber(users.total)} hint={`${formatNumber(users.admins)} admin${users.admins === 1 ? "" : "s"}`} />
        <Card id="active" icon={Activity} label="Active" value={formatNumber(users.active1)} hint={`24h · ${formatNumber(users.active7)} in 7d · ${formatNumber(users.active30)} in 30d`} />
        <Card id="suspended" icon={Ban} label="Suspended" value={formatNumber(users.suspended)} tone={users.suspended ? "warn" : undefined} hint={<Link href="/admin/users" className="underline">Manage users</Link>} />
        <Card id="registrations" icon={UserPlus} label="New accounts" value={formatNumber(users.joined)} hint={`In the last ${range} days`} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Bars label="Registrations" points={users.registrations} />
        </div>
        <Breakdown title="Accounts by plan" rows={business.plans.map((row) => ({ label: row.plan[0]!.toUpperCase() + row.plan.slice(1), value: row.count }))} />
      </div>

      <Heading>Subscriptions and revenue</Heading>
      <div className="rounded-xl border bg-card p-4 text-sm" data-metric="payments">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <CreditCard className="size-3.5" /> Payments
        </p>
        <p className="mt-2">
          <Unavailable>Not available.</Unavailable> {business.payments.reason} Plan assignments above are set by admins.
        </p>
      </div>

      <Heading detail={`Last ${range} days`}>Requests and tokens</Heading>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card id="requests" icon={Zap} label="Requests" value={formatNumber(requests.calls)} hint={`${formatNumber(requests.aborted)} stopped · ${formatNumber(requests.blocked)} blocked`} />
        <Card id="errors" icon={AlertTriangle} label="Errors" value={formatNumber(requests.errors)} tone={errorRate !== null && errorRate >= 5 ? "bad" : undefined} hint={errorRate === null ? "No requests yet" : `${errorRate}% of requests`} />
        <Card
          id="tokens"
          icon={Sparkles}
          label="Tokens"
          value={formatCompact(requests.inputTokens + requests.outputTokens)}
          hint={`${formatCompact(requests.inputTokens)} in · ${formatCompact(requests.outputTokens)} out${requests.estimated ? ` · ${formatNumber(requests.estimated)} estimated` : ""}`}
        />
        <Card
          id="latency"
          icon={Activity}
          label="Average reply"
          value={requests.avgMs === null ? <Unavailable>No replies yet</Unavailable> : `${(requests.avgMs / 1000).toFixed(1)}s`}
          hint={requests.avgInput === null ? undefined : `Average context sent: ${formatNumber(requests.avgInput)} tokens`}
        />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Bars label="Requests" points={requests.daily} />
        <Bars label="Tokens" points={requests.tokensDaily} format={formatCompact} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Breakdown title="By feature" rows={requests.features.map((row) => ({ label: row.feature, value: row.tokens, hint: `${formatCompact(row.tokens)} tokens · ${formatNumber(row.calls)} requests` }))} />
        <Breakdown title="Most used models" rows={requests.topModels.map((row) => ({ label: row.model, value: row.calls, hint: `${formatNumber(row.calls)} requests` }))} />
      </div>

      <Heading>Content</Heading>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card id="conversations" icon={MessageSquare} label="Conversations" value={formatNumber(content.conversations)} hint={`${formatNumber(content.newConversations)} new in ${range} days`} />
        <Card id="messages" icon={MessageSquare} label="Messages" value={formatNumber(content.messages)} hint={`${formatNumber(content.summarised)} chats summarised to fit their context`} />
        <Card id="flagged" icon={ShieldAlert} label="Flagged" value={formatNumber(content.flagged)} hint={<Link href="/admin/conversations?flagged=1" className="underline">Review</Link>} />
        <Card id="research" icon={Sparkles} label="Deep Research" value={formatNumber(requests.features.find((row) => row.feature === "research")?.calls ?? 0)} hint={`Runs in ${range} days`} />
      </div>

      <Heading detail={`Live · sampled ${formatAgo(system.at)}`}>Server</Heading>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          id="cpu"
          icon={Cpu}
          label="CPU"
          value={system.cpu.percent === null ? <Unavailable>Not reported</Unavailable> : `${system.cpu.percent}%`}
          hint={
            <>
              {system.cpu.cores} cores{system.cpu.load ? ` · load ${system.cpu.load.map((value) => value.toFixed(2)).join(" / ")}` : ""}
              <Meter value={system.cpu.percent} />
            </>
          }
        />
        <Card
          id="memory"
          icon={MemoryStick}
          label="Memory"
          value={`${memoryPercent ?? 0}%`}
          hint={
            <>
              {formatBytes(memoryUsed)} of {formatBytes(system.memory.totalBytes)} · app {formatBytes(system.memory.processRssBytes)}
              <Meter value={memoryPercent} />
            </>
          }
        />
        <Card
          id="disk"
          icon={HardDrive}
          label="Disk"
          value={disk ? `${diskPercent}%` : <Unavailable>Not reported</Unavailable>}
          hint={
            disk ? (
              <>
                {formatBytes(disk.freeBytes)} free of {formatBytes(disk.totalBytes)}
                <Meter value={diskPercent} />
              </>
            ) : (
              (system.storage.disk as { reason: string }).reason
            )
          }
        />
        <Card id="uptime" icon={Server} label="Uptime" value={duration(system.uptime.processSeconds)} hint={`App · server up ${duration(system.uptime.systemSeconds)} · Node ${system.runtime.node}`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          id="database"
          icon={Database}
          label="Database"
          value={system.database.ok ? "Healthy" : "Problem"}
          tone={system.database.ok ? undefined : "bad"}
          hint={`${system.database.ok ? "Integrity check passed" : system.database.detail}${system.database.checkMs !== null ? ` in ${system.database.checkMs} ms` : ""} · ${system.database.journalMode ?? "?"} · schema ${system.database.schemaVersion ?? "?"}`}
        />
        <Card
          id="ollama"
          icon={Boxes}
          label="Local models"
          value={system.ollama.ok ? formatNumber(system.ollama.installed) : "Offline"}
          tone={system.ollama.ok ? undefined : "bad"}
          hint={
            system.ollama.ok
              ? `installed · ${system.ollama.loaded === null ? "memory state unknown" : `${system.ollama.loaded} in memory`} · answered in ${system.ollama.responseMs} ms`
              : system.ollama.error
          }
        />
        <Card
          id="providers"
          icon={Server}
          label="Cloud providers"
          value={system.providers.enabled ? `${system.providers.healthy} of ${system.providers.enabled}` : "None"}
          tone={system.providers.failing.length ? "bad" : undefined}
          hint={
            system.providers.enabled
              ? system.providers.failing.length
                ? `Failing: ${system.providers.failing.join(", ")}`
                : `healthy${system.providers.unchecked ? ` · ${system.providers.unchecked} not checked yet` : ""}`
              : "No cloud provider is enabled"
          }
        />
        <Card
          id="jobs"
          icon={Activity}
          label="Running jobs"
          value={formatNumber(system.jobs.running)}
          hint={system.jobs.byAgent.length ? system.jobs.byAgent.map((row) => `${row.agent}: ${row.count}`).join(" · ") : <Link href="/admin/agents" className="underline">No replies are being generated</Link>}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Card id="storage-db" icon={Database} label="Database size" value={formatBytes(system.storage.databaseBytes)} />
        <Card id="storage-files" icon={HardDrive} label="Attachments" value={formatBytes(system.storage.attachmentsBytes)} />
        <Card id="storage-ide" icon={HardDrive} label="IDE workspaces" value={formatBytes(system.storage.workspacesBytes)} hint="Measured at most once a minute" />
      </div>

      <Heading detail={security.since ? `Recorded since ${new Date(security.since).toLocaleDateString()}` : "Recording started with this version"}>Security</Heading>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card id="failed-logins" icon={KeyRound} label="Failed sign-ins" value={formatNumber(security.failed)} tone={security.failed24 >= 20 ? "bad" : undefined} hint={`${formatNumber(security.failed24)} in the last 24h`} />
        <Card id="suspended-logins" icon={Ban} label="Suspended sign-in attempts" value={formatNumber(security.suspended)} />
        <Card id="login-limited" icon={ShieldAlert} label="Sign-ins rate limited" value={formatNumber(security.limited)} />
        <Card id="rate-limits" icon={ShieldAlert} label="Rate-limit hits" value={formatNumber(security.rateLimits)} hint={<Link href="/admin/usage#rate-limits" className="underline">Details</Link>} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Bars label="Failed sign-ins" points={security.failedDaily} />
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Recent security events</p>
          {security.recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="mt-3 divide-y text-sm" data-security-events>
              {security.recent.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                  <span>{SECURITY_LABEL[event.type] ?? event.type}</span>
                  <span className="truncate text-muted-foreground">{event.email ?? "unknown"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {event.ip ?? "no IP"} · {formatAgo(event.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
