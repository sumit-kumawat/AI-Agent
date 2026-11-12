"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Platform = "mac" | "windows" | "linux" | "other";

/** The visitor's operating system, from their browser (never the server's). */
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const source = `${data?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent}`.toLowerCase();
  if (/mac|iphone|ipad|ipod/.test(source)) return "mac";
  if (/win/.test(source)) return "windows";
  if (/linux|x11|cros|android/.test(source)) return "linux";
  return "other";
}

const noop = () => () => {};

/** "other" during server rendering, then the real platform once in the browser. */
export function usePlatform(): Platform {
  return useSyncExternalStore(noop, detectPlatform, () => "other");
}

const MAC: Record<string, string> = { mod: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃", enter: "↩", backspace: "⌫", comma: "," };
const PC: Record<string, string> = { mod: "Ctrl", shift: "Shift", alt: "Alt", ctrl: "Ctrl", enter: "Enter", backspace: "Backspace", comma: "," };

/**
 * Formats a combo such as "mod+shift+o" for the platform: "⇧⌘O" on macOS,
 * "Ctrl+Shift+O" on Windows and Linux. Before the platform is known it uses
 * the neutral "Ctrl/⌘" form so nothing wrong is shown.
 */
export function formatShortcut(combo: string, platform: Platform) {
  const keys = combo.toLowerCase().split("+");
  const key = (name: string) =>
    name.length === 1 ? name.toUpperCase() : name === "comma" ? "," : name === "slash" ? "/" : name[0]!.toUpperCase() + name.slice(1);
  if (platform === "mac") {
    const order = ["ctrl", "alt", "shift", "mod"];
    const mods = order.filter((name) => keys.includes(name)).map((name) => MAC[name]);
    const rest = keys.filter((name) => !order.includes(name)).map((name) => MAC[name] ?? key(name));
    return [...mods, ...rest].join("");
  }
  const label = (name: string) => (platform === "other" && name === "mod" ? "Ctrl/⌘" : (PC[name] ?? key(name)));
  return keys.map(label).join("+");
}

export function useShortcut(combo: string) {
  return formatShortcut(combo, usePlatform());
}

/** True when the event target is a field the person is typing into. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable='true']")) return true;
  if (target.closest("textarea, select, [role='textbox']")) return true;
  if (target.closest(".monaco-editor, [data-terminal]")) return true;
  if (target instanceof HTMLInputElement) {
    const type = (target.type || "text").toLowerCase();
    return !["button", "checkbox", "radio", "submit", "reset", "file", "range", "color", "hidden"].includes(type);
  }
  return Boolean(target.closest("input"));
}

function eventKeyToken(event: KeyboardEvent) {
  if (event.key === ",") return "comma";
  if (event.key === "/") return "slash";
  if (event.key === "`" || event.code === "Backquote") return "`";
  if (event.key === " ") return "space";
  if (event.key.length === 1) return event.key.toLowerCase();
  return event.key.toLowerCase();
}

/**
 * Exact combo match. `mod` is Meta on macOS and Ctrl elsewhere (and either when
 * the platform is unknown). Shift/Alt/Ctrl must match the combo — no extras.
 */
export function matchesShortcut(event: KeyboardEvent, combo: string, platform: Platform = detectPlatform()) {
  const parts = combo.toLowerCase().split("+").filter(Boolean);
  const wantMod = parts.includes("mod");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  const wantCtrl = parts.includes("ctrl");
  const key = parts.find((part) => !["mod", "shift", "alt", "ctrl"].includes(part));
  if (!key) return false;

  const modPressed = platform === "mac" ? event.metaKey : platform === "other" ? event.metaKey || event.ctrlKey : event.ctrlKey;
  // On non-mac, Meta alone must not satisfy `mod` (avoids accidental Cmd chords on Windows keyboards).
  if (wantMod !== modPressed) return false;
  if (wantShift !== event.shiftKey) return false;
  if (wantAlt !== event.altKey) return false;
  // Explicit ctrl in the combo (rare) — separate from mod.
  if (wantCtrl) {
    if (!event.ctrlKey) return false;
  } else if (platform === "mac" && event.ctrlKey) {
    // ⌃+key is a different chord from ⌘+key on macOS.
    return false;
  }

  return eventKeyToken(event) === key;
}

export type HotkeyHandler = {
  combo: string;
  /** Run even while typing in an input (e.g. Cmd/Ctrl+K search). Default false. */
  allowInInput?: boolean;
  /** Skip when focus is inside this selector (e.g. IDE monaco for Cmd+K). */
  ignoreSelector?: string;
  run: (event: KeyboardEvent) => void;
};

/**
 * Single window-level shortcut registry for the app shell.
 * Handlers are checked in order; the first match preventDefaults and runs.
 */
export function useHotkeys(handlers: HotkeyHandler[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const platform = detectPlatform();
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      for (const handler of handlers) {
        if (!matchesShortcut(event, handler.combo, platform)) continue;
        if (handler.ignoreSelector && target?.closest?.(handler.ignoreSelector)) continue;
        if (!handler.allowInInput && isTypingTarget(target)) continue;
        event.preventDefault();
        handler.run(event);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, enabled]);
}
