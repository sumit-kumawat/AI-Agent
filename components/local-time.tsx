"use client";

import { useSyncExternalStore } from "react";
import { formatReset } from "@/lib/plans/types";

const subscribe = () => () => {};

/** A timestamp in the reader's time zone; UTC during server rendering. */
export function LocalTime({ at }: { at: number }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatReset(at),
    () => `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`,
  );
  return (
    <time dateTime={new Date(at).toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
