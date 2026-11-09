"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { Boxes, ChevronDown, Cloud } from "lucide-react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes } from "@/lib/format";
import { parseModelRef, type ModelOption } from "@/lib/model-ref";

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

/** The model this browser picked last, shared across tabs. */
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

/** First candidate the user may use. Cloud models are skipped until they are allowed. */
export function pickModel(
  models: ModelOption[],
  allowCloud: boolean,
  ...candidates: (string | null | undefined)[]
) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = models.find((model) => matches(model, candidate));
    if (match && (match.local || allowCloud)) return match.key;
  }
  return models.find((model) => model.local)?.key ?? (allowCloud ? (models[0]?.key ?? null) : null);
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

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  compact = false,
}: {
  models: ModelOption[];
  value: string | null;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** Borderless trigger that opens upward, for use inside the composer. */
  compact?: boolean;
}) {
  const { prefs, updatePrefs } = useChatChrome();
  const { confirm } = useFeedback();
  const current = models.find((model) => model.key === value);

  async function choose(key: string) {
    const option = models.find((model) => model.key === key);
    if (!option) return;
    if (!option.local && !prefs.cloudModels) {
      const ok = await confirm({
        title: `Send chats to ${option.providerName}?`,
        description: `Messages in this chat, your custom instructions and your saved memories will be sent to ${option.providerName}. They leave this server.`,
        confirmLabel: "Allow",
      });
      if (!ok) return;
      if (!(await updatePrefs({ cloudModels: true }))) return;
    }
    setPreferredModel(key);
    onChange(key);
  }

  if (models.length === 0) {
    return (
      <Button
        asChild
        variant={compact ? "ghost" : "outline"}
        size="sm"
        className={compact ? "h-8 shrink-0 rounded-full px-2.5 text-muted-foreground" : "h-9 shrink-0 md:h-8"}
      >
        <Link href="/chat/models">
          <Boxes />
          Add a model
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
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
        >
          <span className="truncate">{current?.name ?? "Choose model"}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={compact ? "start" : "end"}
        side={compact ? "top" : "bottom"}
        className="w-72 max-w-[calc(100vw-1.5rem)]"
      >
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(key) => void choose(key)}>
          {models.map((model, index) => {
            const header = index === 0 || models[index - 1]?.providerId !== model.providerId;
            return (
              <div key={model.key}>
                {header ? (
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{model.providerName}</DropdownMenuLabel>
                ) : null}
                <DropdownMenuRadioItem value={model.key} className="py-2">
                  {model.local ? null : <Cloud className="size-3.5 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{model.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {model.local ? (model.parameterSize ?? (formatBytes(model.size) || "Local")) : "Cloud"}
                  </span>
                </DropdownMenuRadioItem>
              </div>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="py-2">
          <Link href="/chat/models">
            <Boxes />
            Browse all models
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
