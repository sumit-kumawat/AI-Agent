"use client";

import { useSyncExternalStore } from "react";

export type IdeTheme = "light" | "dark";

const KEY = "conzex-ide-theme";
const EVENT = "conzex-ide-theme";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function read(): IdeTheme {
  return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
}

/** The IDE's own theme; the rest of the app is always light. */
export function useIdeTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as IdeTheme);
  const setTheme = (next: IdeTheme) => {
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [theme, setTheme] as const;
}
