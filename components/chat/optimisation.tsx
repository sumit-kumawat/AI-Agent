"use client";

import { Brain, Check, ChevronDown, Leaf, Scale, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { setPreferredModel, usePreferredModel } from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AUTO_INFO, AUTO_MODES, autoKey, autoModeOf, type AutoMode } from "@/lib/model-ref";

const STORAGE_KEY = "harbor-mode";
const CHANGE_EVENT = "harbor-mode-change";

export const MODE_ICON: Record<AutoMode, LucideIcon> = { intelligence: Brain, balance: Scale, cost: Leaf };

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The optimisation mode for this chat and a setter. The mode is kept apart
 * from the model choice; when the model is Auto, changing the mode changes
 * which model the server routes to.
 */
export function useOptimisation(selection: string | null, select: (key: string) => void) {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const preferred = usePreferredModel();
  const fallback = autoModeOf(stored ? `auto:${stored}` : null) ?? autoModeOf(preferred) ?? "balance";
  const mode = autoModeOf(selection) ?? fallback;
  function change(next: AutoMode) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the choice still applies to this chat.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    if (autoModeOf(selection)) {
      setPreferredModel(autoKey(next));
      select(autoKey(next));
    }
  }
  function switchToAuto() {
    setPreferredModel(autoKey(mode));
    select(autoKey(mode));
  }
  return { mode, auto: autoModeOf(selection) !== null, change, switchToAuto };
}

export function OptimisationSelector({
  mode,
  auto,
  onChange,
  onUseAuto,
  disabled,
}: {
  mode: AutoMode;
  /** The model picker is on Auto, so the mode decides the model. */
  auto: boolean;
  onChange: (mode: AutoMode) => void;
  /** Switches the model picker back to Auto. */
  onUseAuto: () => void;
  disabled?: boolean;
}) {
  const Icon = MODE_ICON[mode];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 gap-1.5 rounded-full px-2.5 ${auto ? "" : "text-muted-foreground"}`}
          aria-label={`Optimisation: ${AUTO_INFO[mode].label}${auto ? "" : " (used with Auto)"}`}
          data-optimisation={mode}
          data-optimisation-active={auto}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{AUTO_INFO[mode].label}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Optimise for{auto ? "" : " (applies when the model is Auto)"}
        </DropdownMenuLabel>
        {AUTO_MODES.map((item) => {
          const ItemIcon = MODE_ICON[item];
          return (
            <DropdownMenuItem
              key={item}
              data-optimisation-option={item}
              onSelect={() => onChange(item)}
              className="items-start gap-2.5 py-2"
            >
              <ItemIcon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {AUTO_INFO[item].label}
                  {item === "balance" ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">Default</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">{AUTO_INFO[item].description}</span>
              </span>
              {item === mode ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
        {auto ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onUseAuto} data-optimisation-use-auto className="text-sm">
              Let Auto pick the model with this mode
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
