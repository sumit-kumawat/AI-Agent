"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Boxes, Check, ChevronDown, Cloud, Search, Sparkles } from "lucide-react";
import type { AutoMode } from "@/lib/model-ref";
import { useChatChrome } from "@/components/chat/chat-shell";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBytes } from "@/lib/format";
import { formatK } from "@/lib/models/capabilities";
import {
  AUTO_INFO,
  autoKey,
  autoModeOf,
  parseModelRef,
  type ModelGroup,
  type ModelOption,
  type ModelSkill,
} from "@/lib/model-ref";

export type { ModelOption };

const STORAGE_KEY = "harbor-model";
const CHANGE_EVENT = "harbor-model-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function readPreferred() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The model or Auto mode this browser picked last, shared across tabs. */
export function usePreferredModel() {
  return useSyncExternalStore(subscribe, readPreferred, () => null);
}

export function setPreferredModel(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private mode can block storage; the choice still applies to this chat.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function matches(model: ModelOption, candidate: string) {
  if (model.key === candidate) return true;
  const ref = parseModelRef(candidate);
  if (!ref || ref.providerId !== model.providerId) return false;
  return (
    model.modelId === ref.modelId ||
    model.modelId === `${ref.modelId}:latest` ||
    ref.modelId === `${model.modelId}:latest`
  );
}

/** First candidate the user may use: an Auto mode or a model. Cloud models are skipped until they are allowed. */
export function pickModel(
  models: ModelOption[],
  allowCloud: boolean,
  ...candidates: (string | null | undefined)[]
) {
  if (models.length === 0) return null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (autoModeOf(candidate)) return candidate;
    const match = models.find((model) => matches(model, candidate));
    if (match && (match.local || allowCloud)) return match.key;
  }
  return autoKey("balance");
}

/** What the chat API needs to know about the selection. */
export function selectionBody(value: string | null, models: ModelOption[]) {
  const mode = autoModeOf(value);
  if (mode) return { mode };
  const selected = models.find((model) => model.key === value);
  return selected ? { model: selected.modelId, providerId: selected.providerId } : {};
}

/** Asks the server to load the model so the first reply starts quickly. */
export function useWarmModel(name: string | null) {
  useEffect(() => {
    if (!name) return;
    void fetch("/api/models/warm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => undefined);
  }, [name]);
}

const GROUPS: ModelGroup[] = ["General", "Reasoning", "Coding", "Cloud"];

const SKILL_LABEL: Record<ModelSkill, string> = {
  vision: "Images",
  code: "Code",
  reasoning: "Reasoning",
  tools: "Tools",
};

/** Every model has these; the picker lists what tells models apart. */
const HIDDEN_IN_PICKER = new Set(["text", "documents", "long-context"]);

function contextTitle(context: ModelOption["context"]) {
  if (context.tokens === null) {
    return context.max ? `The model supports up to ${context.max.toLocaleString("en-US")} tokens; the window on this server is not known yet.` : "Not reported by the provider.";
  }
  const how =
    context.source === "running"
      ? "as loaded in Ollama now"
      : context.source === "model"
        ? "from the model's settings"
        : "this server's default, used when the model loads";
  const max = context.max && context.max > context.tokens ? ` The model itself supports up to ${context.max.toLocaleString("en-US")}.` : "";
  return `${context.tokens.toLocaleString("en-US")} tokens ${how}.${max}`;
}

/** "999.89M" reads as "1B"; "3.2B" stays as it is. */
function sizeLabel(model: ModelOption) {
  if (!model.local) return model.providerName;
  const match = model.parameterSize?.trim().match(/^([\d.]+)\s*M$/i);
  if (match && Number(match[1]) >= 950) return `${Math.round(Number(match[1]) / 1000)}B`;
  return model.parameterSize ?? (formatBytes(model.size) || "Local");
}

function searchable(model: ModelOption) {
  return [
    model.name,
    model.providerName,
    model.group,
    ...model.skills.map((skill) => SKILL_LABEL[skill]),
    ...model.capabilities.map((capability) => capability.label),
  ]
    .join(" ")
    .toLowerCase();
}

/** Arrow keys move between options; the search box hands focus to the first one. */
function moveFocus(event: KeyboardEvent<HTMLElement>, list: HTMLElement | null) {
  if (!list || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  if (options.length === 0) return;
  event.preventDefault();
  const index = options.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "ArrowDown"
      ? options[index < 0 ? 0 : Math.min(options.length - 1, index + 1)]
      : index <= 0
        ? null
        : options[index - 1];
  if (next) next.focus();
  else list.parentElement?.querySelector<HTMLInputElement>("input")?.focus();
}

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  compact = false,
  mode: optimisation = "balance",
}: {
  models: ModelOption[];
  value: string | null;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** The optimisation mode Auto uses; chosen in its own selector. */
  mode?: AutoMode;
  /** Borderless trigger that opens upward, for use inside the composer. */
  compact?: boolean;
}) {
  const { prefs, updatePrefs, admin } = useChatChrome();
  const { confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const mode = autoModeOf(value);
  const current = models.find((model) => model.key === value);

  async function choose(key: string) {
    const option = models.find((model) => model.key === key);
    if (!autoModeOf(key)) {
      if (!option) return;
      if (!option.local && !prefs.cloudModels) {
        setOpen(false);
        const ok = await confirm({
          title: `Send chats to ${option.providerName}?`,
          description: `Messages in this chat, your custom instructions and your saved memories will be sent to ${option.providerName}. They leave this server.`,
          confirmLabel: "Allow",
        });
        if (!ok) return;
        if (!(await updatePrefs({ cloudModels: true }))) return;
      }
    }
    setPreferredModel(key);
    onChange(key);
    setOpen(false);
  }

  if (models.length === 0) {
    return admin ? (
      <Button
        asChild
        variant={compact ? "ghost" : "outline"}
        size="sm"
        className={compact ? "h-8 shrink-0 rounded-full px-2.5 text-muted-foreground" : "h-9 shrink-0 md:h-8"}
      >
        <Link href="/admin/models">
          <Boxes />
          Add a model
        </Link>
      </Button>
    ) : (
      <span className="px-2.5 text-xs text-muted-foreground" data-no-models>
        No models available
      </span>
    );
  }

  const needle = query.trim().toLowerCase();
  const showAuto = !needle || "auto automatic".includes(needle);
  const visible = models.filter((model) => !needle || searchable(model).includes(needle));
  const optionClass = (selected: boolean) =>
    `flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent ${
      selected ? "bg-accent/60" : ""
    }`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant={compact ? "ghost" : "outline"}
          size="sm"
          className={
            compact
              ? "h-8 max-w-[11rem] shrink-0 rounded-full px-2.5 text-muted-foreground sm:max-w-[16rem]"
              : "h-9 max-w-[10.5rem] shrink-0 sm:max-w-[16rem] md:h-8"
          }
          aria-label="Choose model"
          data-model-selection={value ?? ""}
        >
          {mode ? <Sparkles className="opacity-70" /> : null}
          <span className="truncate">{mode ? "Auto" : (current?.name ?? "Choose model")}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={compact ? "start" : "end"}
        side={compact ? "top" : "bottom"}
        collisionPadding={8}
        className="flex max-h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-1.5rem)] flex-col p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>("input")?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => moveFocus(event, list.current)}
            placeholder="Search models"
            aria-label="Search models"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={list}
          role="listbox"
          aria-label="Models"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
          onKeyDown={(event) => moveFocus(event, list.current)}
        >
          {showAuto ? (
            <div role="group" aria-label="Auto">
              <button
                type="button"
                role="option"
                aria-selected={mode !== null}
                data-model-option="auto"
                onClick={() => void choose(autoKey(optimisation))}
                className={optionClass(mode !== null)}
              >
                <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Auto</span>
                  <span className="block text-xs text-muted-foreground">
                    Picks a model for each message, optimised for {AUTO_INFO[optimisation].label.toLowerCase()}
                  </span>
                </span>
                {mode !== null ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
              </button>
            </div>
          ) : null}
          {GROUPS.map((group) => {
            const items = visible.filter((model) => model.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} role="group" aria-label={group}>
                <p className="px-2.5 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">{group}</p>
                {items.map((model) => {
                  const selected = value === model.key;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-model-option={model.modelId}
                      data-limitations={model.limitations.join(" ")}
                      title={model.limitations.length ? `Limitations:\n${model.limitations.map((line) => `• ${line}`).join("\n")}` : undefined}
                      onClick={() => void choose(model.key)}
                      className={optionClass(selected)}
                    >
                      {model.local ? (
                        <Boxes className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <Cloud className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Cloud model" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate">{model.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{sizeLabel(model)}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground" data-capabilities>
                          <span data-context-window={model.context.tokens ?? ""} title={contextTitle(model.context)}>
                            {model.context.tokens ? `${formatK(model.context.tokens)} context` : "Context not reported"}
                          </span>
                          {model.capabilities
                            .filter((capability) => !HIDDEN_IN_PICKER.has(capability.id))
                            .map((capability) => (
                              <span key={capability.id} className="rounded border px-1" title={capability.source} data-capability={capability.id}>
                                {capability.label}
                              </span>
                            ))}
                        </span>
                      </span>
                      {selected ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!showAuto && visible.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">No models match.</p>
          ) : null}
        </div>
        {admin ? (
          <div className="border-t p-1.5">
            <Link
              href="/admin/models"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent"
            >
              <Boxes className="size-4" />
              Manage models
            </Link>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
