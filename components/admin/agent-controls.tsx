"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  killAgentSession,
  setModelEnabled,
  updateAgentConfig,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function AgentRow({
  agent,
  connected,
  running,
}: {
  agent: { id: string; name: string; kind: string; description: string; enabled: boolean; maxConcurrency: number };
  connected: boolean;
  running: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(String(agent.maxConcurrency));

  function save(patch: { enabled?: boolean; maxConcurrency?: number }) {
    setError(null);
    startTransition(async () => {
      const result = await updateAgentConfig(agent.id, patch);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{agent.name}</p>
          <Badge variant="outline" className="font-mono">{agent.id}</Badge>
          {connected ? (
            <Badge variant="secondary">{agent.kind === "builtin" ? "built in" : "connected"}</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">no adapter connected</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{agent.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {running} running · limit {agent.maxConcurrency}
        </p>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save({ maxConcurrency: Number(limit) });
        }}
      >
        <label className="text-xs text-muted-foreground" htmlFor={`limit-${agent.id}`}>
          Max concurrent
        </label>
        <Input
          id={`limit-${agent.id}`}
          type="number"
          min={1}
          max={64}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          className="h-8 w-20"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending || Number(limit) === agent.maxConcurrency}
        >
          Save
        </Button>
      </form>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={agent.enabled}
          disabled={pending}
          onCheckedChange={(enabled) => save({ enabled })}
          aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
        />
        {agent.enabled ? "On" : "Off"}
      </label>
    </div>
  );
}

export function LiveRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(true);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [live, router, seconds]);
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Switch checked={live} onCheckedChange={setLive} />
      Auto-refresh every {seconds}s
    </label>
  );
}

export function KillButton({ sessionId, label }: { sessionId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center justify-end gap-2">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Stop ${label}? The reply ends immediately.`)) return;
          setError(null);
          startTransition(async () => {
            const result = await killAgentSession(sessionId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Stopping…" : "Kill"}
      </Button>
    </div>
  );
}

export function ModelToggle({ name, enabled }: { name: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-2 text-sm">
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
      <Switch
        checked={enabled}
        disabled={pending}
        aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}
        onCheckedChange={(next) => {
          setError(null);
          startTransition(async () => {
            const result = await setModelEnabled(name, next);
            if (!result.ok) setError(result.error);
          });
        }}
      />
      <span className="w-16">{enabled ? "Enabled" : "Disabled"}</span>
    </label>
  );
}
