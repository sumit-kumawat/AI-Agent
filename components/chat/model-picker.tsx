"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { Boxes, ChevronDown } from "lucide-react";
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
import type { InstalledModel } from "@/lib/ollama";

export type ModelOption = Pick<InstalledModel, "name" | "parameterSize" | "size">;

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

/** First candidate that is installed, else the first installed model. */
export function pickModel(
  models: ModelOption[],
  ...candidates: (string | null | undefined)[]
) {
  for (const candidate of candidates) {
    if (candidate && models.some((model) => model.name === candidate)) {
      return candidate;
    }
  }
  return models[0]?.name ?? null;
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

export function formatBytes(bytes: number) {
  if (!bytes) return "";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ModelOption[];
  value: string | null;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  if (models.length === 0) {
    return (
      <Button asChild variant="outline" size="sm" className="h-9 shrink-0 md:h-8">
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
          variant="outline"
          size="sm"
          className="h-9 max-w-[10.5rem] shrink-0 sm:max-w-[16rem] md:h-8"
          aria-label="Choose model"
        >
          <span className="truncate">{value ?? "Choose model"}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1.5rem)]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Installed models
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? ""}
          onValueChange={(name) => {
            setPreferredModel(name);
            onChange(name);
          }}
        >
          {models.map((model) => (
            <DropdownMenuRadioItem key={model.name} value={model.name} className="py-2">
              <span className="min-w-0 flex-1 truncate">{model.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {model.parameterSize ?? formatBytes(model.size)}
              </span>
            </DropdownMenuRadioItem>
          ))}
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
