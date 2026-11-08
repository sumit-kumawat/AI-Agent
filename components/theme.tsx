"use client";

import { useEffect, type ReactNode } from "react";
import { FeedbackProvider } from "@/components/feedback";

/** Follows the OS theme while the user's preference is "system". */
function useSystemTheme() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const root = document.documentElement;
      if ((root.dataset.theme ?? "system") === "system") root.classList.toggle("dark", query.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useSystemTheme();
  return <FeedbackProvider>{children}</FeedbackProvider>;
}
