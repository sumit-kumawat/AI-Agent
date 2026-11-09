"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCompatibleProvider,
  removeProvider,
  testProvider,
  updateModel,
  updateProvider,
  updateRouting,
} from "@/app/admin/provider-actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { modelKey, parseModelRef } from "@/lib/model-ref";
import type { ModelRef, PublicProvider } from "@/lib/providers/store";

type Choice = { providerId: string; modelId: string; providerName: string; local: boolean };

function statusOf(provider: PublicProvider) {
  if (!provider.enabled) return "Off";
  if (provider.kind === "ollama") return provider.healthOk === false ? "Unreachable" : "Local";
  if (!provider.hasKey) return "Needs an API key";
  if (provider.healthOk === null) return "Not checked";
  if (!provider.healthOk) return "Unreachable";
  const enabled = provider.models.filter((model) => model.enabled && model.available).length;
  return enabled ? "Ready" : "No models enabled";
}

const STATUS_CLASS: Record<string, string> = {
  Ready: "bg-primary/10 text-primary",
  Local: "bg-primary/10 text-primary",
  Off: "bg-muted text-muted-foreground",
  "Needs an API key": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "Not checked": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "No models enabled": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Unreachable: "bg-destructive/10 text-destructive",
};

function ProviderCard({ provider }: { provider: PublicProvider }) {
  const router = useRouter();
  const { confirm, notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [enabled, setEnabled] = useState(provider.enabled);
  const [apiKey, setApiKey] = useState("");
  const status = statusOf(provider);
  const cloud = provider.kind !== "ollama";

  function save(extra: { apiKey?: string | null } = {}) {
    start(async () => {
      const result = await updateProvider({
        id: provider.id,
        name,
        baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
        enabled,
        ...extra,
        ...(extra.apiKey === undefined && apiKey.trim() ? { apiKey } : {}),
      });
      if (!result.ok) {
        void notify({ tone: "error", title: "Not saved", description: result.error });
        return;
      }
      setApiKey("");
      toast("Provider saved");
      router.refresh();
    });
  }

  return (
    <article data-provider={provider.id} className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{provider.name}</h2>
        <span className="text-xs text-muted-foreground capitalize">{provider.kind}</span>
        <span data-provider-status className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
          {status}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {provider.kind === "ollama"
          ? "Runs on this server. Installed models are managed from Agents & models."
          : provider.kind === "compatible"
            ? "Any service that speaks the OpenAI API. The base URL should include /v1."
            : "Chats, custom instructions and saved memories are sent to this provider when a member chooses one of its models."}
      </p>
      {provider.healthError ? (
        <p data-health-error className="mt-2 text-sm text-destructive">
          {provider.healthError}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{provider.kind === "ollama" ? "Base URL" : "Base URL (optional)"}</span>
          <Input
            name="baseUrl"
            value={baseUrl}
            placeholder={provider.kind === "ollama" ? "http://127.0.0.1:11434" : "Leave blank for the official endpoint"}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        {cloud ? (
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium">API key</span>
            <Input
              name="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              placeholder={provider.hasKey ? `Key saved (${provider.apiKeyHint}). Leave blank to keep it.` : "Paste an API key"}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`Enable ${provider.name}`} />
        <span className="mr-auto text-sm">{enabled ? "Enabled" : "Disabled"}</span>
        <Button type="button" variant="outline" disabled={pending} onClick={() => save()}>
          Save
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await testProvider(provider.id);
              if (!result.ok) void notify({ tone: "error", title: "Connection failed", description: result.error });
              else toast(`Connected. ${result.models} models found.`);
              router.refresh();
            })
          }
        >
          Check connection
        </Button>
        {provider.hasKey ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => save({ apiKey: null })}>
            Remove key
          </Button>
        ) : null}
        {provider.kind === "compatible" ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const ok = await confirm({
                  title: `Delete ${provider.name}?`,
                  description: "Its models are removed. Chats that used them will need another model.",
                  confirmLabel: "Delete",
                  destructive: true,
                });
                if (!ok) return;
                const result = await removeProvider(provider.id);
                if (!result.ok) void notify({ tone: "error", title: "Not deleted", description: result.error });
                else router.refresh();
              })
            }
          >
            Delete
          </Button>
        ) : null}
      </div>

      {provider.models.length > 0 ? (
        <details className="mt-4" open={provider.models.some((model) => model.enabled)}>
          <summary className="cursor-pointer text-sm font-medium">
            Models ({provider.models.filter((model) => model.available).length} from the last check)
          </summary>
          <ul className="mt-2 divide-y rounded-xl border">
            {provider.models.map((model) => (
              <li key={model.modelId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Switch
                  checked={model.enabled}
                  disabled={!model.available}
                  aria-label={`Offer ${model.modelId}`}
                  onCheckedChange={(next) =>
                    start(async () => {
                      const result = await updateModel({
                        providerId: provider.id,
                        modelId: model.modelId,
                        enabled: next,
                      });
                      if (!result.ok) void notify({ tone: "error", title: "Not updated", description: result.error });
                      else router.refresh();
                    })
                  }
                />
                <span className={`min-w-0 flex-1 truncate font-mono text-xs ${model.available ? "" : "text-muted-foreground line-through"}`}>
                  {model.modelId}
                </span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  In
                  <Input
                    defaultValue={model.inputPerMillion ?? ""}
                    inputMode="decimal"
                    className="h-8 w-20"
                    aria-label={`${model.modelId} input price`}
                    onBlur={(event) => {
                      const raw = event.target.value.trim();
                      const value = raw === "" ? null : Number(raw);
                      if (value !== null && !Number.isFinite(value)) return;
                      void updateModel({ providerId: provider.id, modelId: model.modelId, inputPerMillion: value });
                    }}
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Out
                  <Input
                    defaultValue={model.outputPerMillion ?? ""}
                    inputMode="decimal"
                    className="h-8 w-20"
                    aria-label={`${model.modelId} output price`}
                    onBlur={(event) => {
                      const raw = event.target.value.trim();
                      const value = raw === "" ? null : Number(raw);
                      if (value !== null && !Number.isFinite(value)) return;
                      void updateModel({ providerId: provider.id, modelId: model.modelId, outputPerMillion: value });
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Prices are USD per million tokens. Blank means the cost is not estimated.</p>
        </details>
      ) : null}
    </article>
  );
}

export function ProvidersManager({
  providers,
  routing,
  selectable,
}: {
  providers: PublicProvider[];
  routing: { defaultModel: ModelRef | null; fallbackModel: ModelRef | null };
  selectable: Choice[];
}) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [pending, start] = useTransition();
  const [fallback, setFallback] = useState(routing.fallbackModel ? modelKey(routing.fallbackModel.providerId, routing.fallbackModel.modelId) : "");
  const [preferred, setPreferred] = useState(routing.defaultModel ? modelKey(routing.defaultModel.providerId, routing.defaultModel.modelId) : "");
  const [draft, setDraft] = useState({ name: "", baseUrl: "", apiKey: "" });

  function refFrom(value: string) {
    return value ? parseModelRef(value) : null;
  }

  return (
    <div className="space-y-4">
      <form
        className="rounded-2xl border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result = await updateRouting({ defaultModel: refFrom(preferred), fallbackModel: refFrom(fallback) });
            if (!result.ok) void notify({ tone: "error", title: "Not saved", description: result.error });
            else {
              toast("Routing saved");
              router.refresh();
            }
          });
        }}
      >
        <h2 className="font-medium">Routing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The default is used for new chats. The fallback answers when the chosen provider has failed its last check
          or a call just failed. Only models that are available right now are listed.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Default model</span>
            <select
              value={preferred}
              onChange={(event) => setPreferred(event.target.value)}
              className="h-9 rounded-lg border bg-background px-2.5 text-sm"
            >
              <option value="">Automatic</option>
              {selectable.map((model) => (
                <option key={modelKey(model.providerId, model.modelId)} value={modelKey(model.providerId, model.modelId)}>
                  {model.providerName} · {model.modelId}
                  {model.local ? "" : " (cloud)"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Fallback model</span>
            <select
              value={fallback}
              onChange={(event) => setFallback(event.target.value)}
              className="h-9 rounded-lg border bg-background px-2.5 text-sm"
            >
              <option value="">None</option>
              {selectable.map((model) => (
                <option key={modelKey(model.providerId, model.modelId)} value={modelKey(model.providerId, model.modelId)}>
                  {model.providerName} · {model.modelId}
                  {model.local ? "" : " (cloud)"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="submit" disabled={pending}>
            Save routing
          </Button>
        </div>
      </form>

      {providers.map((provider) => (
        <ProviderCard key={`${provider.id}:${provider.healthAt ?? 0}:${provider.apiKeyHint ?? ""}`} provider={provider} />
      ))}

      <form
        className="rounded-2xl border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            const result = await addCompatibleProvider(draft);
            if (!result.ok) {
              void notify({ tone: "error", title: "Not added", description: result.error });
              return;
            }
            setDraft({ name: "", baseUrl: "", apiKey: "" });
            toast("Provider added. Run a connection check to list its models.");
            router.refresh();
          });
        }}
      >
        <h2 className="font-medium">Add an OpenAI-compatible provider</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Name</span>
            <Input name="name" value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Base URL</span>
            <Input
              name="baseUrl"
              value={draft.baseUrl}
              placeholder="https://example.com/v1"
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium">API key</span>
            <Input
              name="apiKey"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="submit" disabled={pending || !draft.name.trim() || !draft.baseUrl.trim() || draft.apiKey.trim().length < 8}>
            Add provider
          </Button>
        </div>
      </form>
    </div>
  );
}
