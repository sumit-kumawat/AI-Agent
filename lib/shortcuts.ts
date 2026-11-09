"use client";

import { useSyncExternalStore } from "react";

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

const MAC: Record<string, string> = { mod: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃", enter: "↩", backspace: "⌫" };
const PC: Record<string, string> = { mod: "Ctrl", shift: "Shift", alt: "Alt", ctrl: "Ctrl", enter: "Enter", backspace: "Backspace" };

/**
 * Formats a combo such as "mod+shift+o" for the platform: "⇧⌘O" on macOS,
 * "Ctrl+Shift+O" on Windows and Linux. Before the platform is known it uses
 * the neutral "Ctrl/⌘" form so nothing wrong is shown.
 */
export function formatShortcut(combo: string, platform: Platform) {
  const keys = combo.toLowerCase().split("+");
  const key = (name: string) => (name.length === 1 ? name.toUpperCase() : name === "comma" ? "," : name === "slash" ? "/" : name[0]!.toUpperCase() + name.slice(1));
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
