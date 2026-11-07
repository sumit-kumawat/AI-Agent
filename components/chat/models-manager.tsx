"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Download, Search, Trash } from "lucide-react";
import { ChatTopBar } from "@/components/chat/chat-shell";
import { setPreferredModel, usePreferredModel } from "@/components/chat/model-picker";
import { formatBytes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogGroup, CatalogModel } from "@/lib/model-catalog";
import type { InstalledModel } from "@/lib/ollama";

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

export function ModelsManager({
  admin,
  installed,
  defaultModel,
  ollamaError,
  catalog,
}: {
  admin: boolean;
  installed: InstalledModel[];
  defaultModel: string | null;
  ollamaError: string | null;
  catalog: CatalogGroup[];
}) {
  const router = useRouter();
  const preferred = usePreferredModel();
  const [pulls, setPulls] = useState<Record<string, PullState>>({});
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<string | null>(null);
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
    if (!window.confirm(`Remove ${name} from this server?`)) return;
    const response = await fetch("/api/models", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok && response.status !== 204) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setNotice(data?.error ?? "Could not remove that model.");
      return;
    }
    setNotice(`${name} was removed.`);
    router.refresh();
  }

  function use(name: string) {
    setPreferredModel(name);
    setNotice(`New chats will use ${name}.`);
  }

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar
        title="Models"
        detail={admin ? "Download, choose, and remove models" : "Choose the model for new chats"}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-3 py-6 sm:px-6">
          {ollamaError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              {ollamaError}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-xl border bg-muted px-4 py-3 text-sm" role="status">
              {notice}
            </p>
          ) : null}

          <section>
            <h2 className="font-heading text-2xl sm:text-3xl">Installed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chat models of about one billion parameters and up. Pick one per
              chat from the menu at the top right.
            </p>
            {installed.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No chat models yet.{" "}
                {admin ? "Download one below." : "Ask an admin to add one."}
              </p>
            ) : (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {installed.map((model) => (
                  <div
                    key={model.name}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      model.name === active ? "ring-2 ring-primary" : ""
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
                    {model.name === active ? (
                      <Badge>In use</Badge>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => use(model.name)}>
                        Use
                      </Button>
                    )}
                    {admin ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${model.name}`}
                        onClick={() => remove(model.name)}
                      >
                        <Trash />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-heading text-2xl sm:text-3xl">Library</h2>
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
