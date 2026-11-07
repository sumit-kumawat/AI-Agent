"use client";

import { createContext, useContext } from "react";

/** The IDE's root element, so menus and dialogs portal inside it and pick up its theme. */
export const IdeRootContext = createContext<HTMLElement | null>(null);

export function useIdeRoot() {
  return useContext(IdeRootContext) ?? undefined;
}
