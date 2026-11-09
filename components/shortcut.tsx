"use client";

import { useShortcut } from "@/lib/shortcuts";

/** A keyboard shortcut written the way the visitor's operating system writes it. */
export function Kbd({ combo, className = "" }: { combo: string; className?: string }) {
  const label = useShortcut(combo);
  return (
    <kbd className={`font-sans text-xs text-muted-foreground ${className}`} data-shortcut={combo}>
      {label}
    </kbd>
  );
}
