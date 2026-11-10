"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Activity, Check, Cpu, Download, Layers, Loader2, Power, PowerOff, Search, Trash } from "lucide-react";
import { setModelLoaded } from "@/app/admin/actions";
import { useChatChrome } from "@/components/chat/chat-shell";
import { setPreferredModel, usePreferredModel, type ModelOption } from "@/components/chat/model-picker";
import { contextLabel, formatK } from "@/lib/models/capabilities";
import { useFeedback } from "@/components/feedback";
import { formatBytes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogGroup, CatalogModel } from "@/lib/model-catalog";
import type { InstalledModel, LoadedModel } from "@/lib/ollama";

type PullState = {
  status: string;
  percent: number | null;
  error: string | null;
  done: boolean;
};

type Filter = "all" | CatalogModel["tags"][number];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fast", label: "Fast" },
  { id: "general", label: "General" },
  { id: "code", label: "Code" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "multilingual", label: "Multilingual" },
];

function isInstalled(installed: InstalledModel[], name: string) {
  return installed.some(
    (model) => model.name === name || model.name === `${name}:latest`,
  );
}

/** What a model can do here, its real context window, and what it cannot do. */
function ModelProfileView({ profile }: { profile: ModelOption }) {
  return (
    <div className="w-full space-y-1.5 text-xs">
      <p className="flex flex-wrap gap-1" data-capabilities>
        {profile.capabilities.map((capability) => (
          <span key={capability.id} className="rounded border px-1.5 py-0.5" title={capability.source} data-capability={capability.id}>
            {capability.label}
          </span>
        ))}
      </p>
      <p className="text-muted-foreground" data-context-window={profile.context.tokens ?? ""}>
        Context: {contextLabel(profile.context)}
        {profile.context.max && profile.context.tokens && profile.context.max > profile.context.tokens
          ? ` · model supports up to ${formatK(profile.context.max)}`
          : ""}
      </p>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer">Limitations</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4" data-limitations>
          {profile.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export type ModelRuntime = {
  loaded: LoadedModel | null;
  enabled: boolean;
  plans: string[];
  stats: { calls: number; errors: number; avgMs: number | null; lastAt: number } | null;
};

type RuntimeSummary = { reachable: boolean; version: string | null; models: Record<string, ModelRuntime>; checkedAt: number };

function RuntimeStatus({ name, runtime, checkedAt }: { name: string; runtime: ModelRuntime; checkedAt: number }) {
  const router = useRouter();
  const { report } = useFeedback();
  const [pending, startTransition] = useTransition();
  const loaded = runtime.loaded;
  const toggle = (load: boolean) =>
    startTransition(async () => {
      const result = await setModelLoaded(name, load);
      if (report(result, { title: load ? "Model loaded" : "Model unloaded", description: load ? `${name} stays in memory for 30 minutes.` : `${name} was freed from memory.` })) {
        router.refresh();
      }
    });
  return (
    <div className="w-full space-y-2 border-t pt-2 text-xs" data-model-runtime={name}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 ${loaded ? "text-primary" : "text-muted-foreground"}`} data-loaded={loaded ? "yes" : "no"}>
          <span className={`size-1.5 rounded-full ${loaded ? "bg-primary" : "bg-muted-foreground/50"}`} aria-hidden />
          {loaded
            ? `Loaded · ${formatBytes(loaded.sizeBytes)}${loaded.vramBytes ? ` (${Math.round((loaded.vramBytes / Math.max(1, loaded.sizeBytes)) * 100)}% on GPU)` : " on CPU"}`
            : "Not loaded"}
        </span>
        {loaded?.expiresAt ? (
          <span className="text-muted-foreground">
            · unloads in {Math.max(1, Math.round((loaded.expiresAt - checkedAt) / 60_000))} min if idle
          </span>
        ) : null}
        {!runtime.enabled ? <Badge variant="destructive">Disabled for users</Badge> : null}
      </div>
      <p className="text-muted-foreground" data-model-plans>
        <Layers className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        {runtime.plans.length ? `Plans: ${runtime.plans.join(", ")}` : "Not in any plan; only admins can use it"}
      </p>
      <p className="text-muted-foreground" data-model-stats>
        <Activity className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        {runtime.stats
          ? `${runtime.stats.calls} calls in 30 days · ${runtime.stats.errors} errors${runtime.stats.avgMs ? ` · ${(runtime.stats.avgMs / 1000).toFixed(1)} s average reply` : ""}`
          : "No calls in 30 days"}
      </p>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => toggle(!loaded)} data-model-load={loaded ? "unload" : "load"}>
        {pending ? <Loader2 className="animate-spin" /> : loaded ? <PowerOff /> : <Power />}
        {loaded ? "Unload" : "Load"}
      </Button>
    </div>
  );
}

export function ModelsManager({
  admin,
  installed,
  defaultModel,
  ollamaError,
  catalog,
  runtime,
}: {
  admin: boolean;
  installed: InstalledModel[];
  defaultModel: string | null;
  ollamaError: string | null;
  catalog: CatalogGroup[];
  runtime?: RuntimeSummary;
}) {
  const router = useRouter();
  const { models: profiles } = useChatChrome();
  const preferred = usePreferredModel();
  const [pulls, setPulls] = useState<Record<string, PullState>>({});
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { confirm, notify } = useFeedback();
  const active = installed.some((model) => model.name === preferred)
    ? preferred
    : defaultModel;

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog
      .map((group) => ({
        ...group,
        models: group.models.filter(
          (model) =>
            (filter === "all" || model.tags.includes(filter)) &&
            (!needle ||
              model.name.includes(needle) ||
              model.label.toLowerCase().includes(needle)),
        ),
      }))
      .filter((group) => group.models.length > 0);
  }, [catalog, filter, query]);

  function update(name: string, patch: Partial<PullState>) {
    const initial: PullState = { status: "Starting…", percent: null, error: null, done: false };
    setPulls((current) => ({
      ...current,
      [name]: { ...initial, ...current[name], ...patch },
    }));
  }

  async function pull(name: string) {
    update(name, { status: "Starting…", percent: null, error: null, done: false });
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        update(name, { error: data?.error ?? "Download failed.", done: true });
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let failed: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            status?: string;
            total?: number;
            completed?: number;
            error?: string;
          };
          if (event.error) {
            failed = event.error;
            continue;
          }
          update(name, {
            status: event.status ?? "Downloading",
            percent:
              event.total && event.completed !== undefined
                ? Math.floor((event.completed / event.total) * 100)
                : null,
          });
        }
      }
      if (failed) {
        update(name, { error: failed, done: true });
        return;
      }
      update(name, { status: "Installed", percent: 100, done: true });
      router.refresh();
    } catch {
      update(name, { error: "Download interrupted. Try again to resume.", done: true });
    }
  }

  async function remove(name: string) {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: "The model is deleted from this server. You can download it again later.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const response = await fetch("/api/models", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok && response.status !== 204) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      void notify({ tone: "error", title: "Remove failed", description: data?.error ?? "Could not remove that model." });
      return;
    }
    void notify({ tone: "success", title: "Model removed", description: `${name} was removed from this server.` });
    router.refresh();
  }

  function use(name: string) {
    setPreferredModel(name);
    void notify({ tone: "success", title: "Default model updated", description: `New chats will use ${name}.` });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-3xl">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Local models as Ollama reports them: what is loaded in memory, which plans include each one, how it has been used, and the library to
          download more. Plan access is set under Plans; turning a model off for everyone is under Agents &amp; routing.
        </p>
      </div>
      <div>
        <div className="space-y-8">
          {ollamaError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              {ollamaError}
            </p>
          ) : null}

          {runtime ? (
            <section className="grid gap-3 sm:grid-cols-3" data-runtime-summary>
              <div className="rounded-xl border bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Cpu className="size-3.5" aria-hidden /> Runtime
                </p>
                <p className="mt-2 text-lg font-medium">{runtime.reachable ? "Ollama running" : "Ollama unreachable"}</p>
                <p className="text-xs text-muted-foreground">{runtime.version ? `Version ${runtime.version}` : "Version not reported"}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Power className="size-3.5" aria-hidden /> In memory
                </p>
                <p className="mt-2 text-lg font-medium" data-loaded-count>
                  {Object.values(runtime.models).filter((model) => model.loaded).length} of {installed.length} models
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(Object.values(runtime.models).reduce((sum, model) => sum + (model.loaded?.sizeBytes ?? 0), 0))} used
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Activity className="size-3.5" aria-hidden /> Last 30 days
                </p>
                <p className="mt-2 text-lg font-medium">
                  {Object.values(runtime.models).reduce((sum, model) => sum + (model.stats?.calls ?? 0), 0)} calls
                </p>
                <p className="text-xs text-muted-foreground">
                  {Object.values(runtime.models).reduce((sum, model) => sum + (model.stats?.errors ?? 0), 0)} errors
                </p>
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-base font-medium">Installed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chat models of about one billion parameters and up. Loading keeps a model in memory so its first reply is fast; unloading frees
              the memory.
            </p>
            {installed.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No chat models yet.{" "}
                {admin ? "Download one below." : "Ask an admin to add one."}
              </p>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {installed.map((model) => {
                  const profile = profiles.find((option) => option.local && option.modelId === model.name);
                  return (
                  <div
                    key={model.name}
                    data-installed-model={model.name}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 ${
                      !admin && model.name === active ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{model.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[model.parameterSize, formatBytes(model.size), model.quantization]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {admin ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${model.name}`}
                        title={`Remove ${model.name} from this server`}
                        onClick={() => remove(model.name)}
                      >
                        <Trash />
                      </Button>
                    ) : model.name === active ? (
                      <Badge>In use</Badge>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => use(model.name)}>
                        Use
                      </Button>
                    )}
                    {profile ? <ModelProfileView profile={profile} /> : null}
                    {runtime?.models[model.name] ? (
                      <RuntimeStatus name={model.name} runtime={runtime.models[model.name]} checkedAt={runtime.checkedAt} />
                    ) : null}
                  </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-medium">Library</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open models from 1B to 70B parameters.{" "}
              {admin
                ? "Downloads run on this server and resume if interrupted."
                : "Only an admin can download models."}
            </p>

            {admin ? (
              <form
                className="mt-4 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = custom.trim();
                  if (name) void pull(name);
                }}
              >
                <Input
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  placeholder="Any Ollama model, for example mixtral:8x7b"
                  aria-label="Model name"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-10"
                />
                <Button type="submit" className="h-10 shrink-0" disabled={!custom.trim()}>
                  <Download />
                  Download
                </Button>
              </form>
            ) : null}
            {custom.trim() && pulls[custom.trim()] ? (
              <PullProgress state={pulls[custom.trim()]!} />
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the library"
                  aria-label="Search models"
                  className="h-9 pl-8"
                />
              </div>
              <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
                {FILTERS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={filter === item.id ? "default" : "outline"}
                    className="shrink-0"
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-8">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No models match that search.</p>
              ) : null}
              {groups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-sm font-medium">{group.title}</h3>
                  <p className="text-xs text-muted-foreground">{group.detail}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.models.map((model) => {
                      const state = pulls[model.name];
                      const have = isInstalled(installed, model.name);
                      const running = state && !state.done;
                      return (
                        <div key={model.name} className="flex flex-col rounded-xl border p-3">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{model.label}</p>
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {model.name}
                              </p>
                            </div>
                            {have ? (
                              <Badge variant="outline" className="shrink-0">
                                <Check />
                                Installed
                              </Badge>
                            ) : admin ? (
                              <Button
                                type="button"
                                size="sm"
                                className="shrink-0"
                                disabled={running}
                                onClick={() => pull(model.name)}
                              >
                                <Download />
                                {running ? "Downloading" : "Get"}
                              </Button>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {model.params} · {model.download} download · {model.memory} memory
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {model.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="capitalize">
                                {tag}
                              </Badge>
                            ))}
                            <Badge variant="outline">{model.license}</Badge>
                          </div>
                          {state && !have ? <PullProgress state={state} /> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PullProgress({ state }: { state: PullState }) {
  if (state.error) {
    return <p className="mt-2 text-xs text-destructive">{state.error}</p>;
  }
  return (
    <div className="mt-2" aria-live="polite">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${state.percent ?? (state.done ? 100 : 4)}%` }}
        />
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {state.status}
        {state.percent !== null && !state.done ? ` · ${state.percent}%` : ""}
      </p>
    </div>
  );
}
