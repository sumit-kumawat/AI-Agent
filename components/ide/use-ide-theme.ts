"use client";

export type IdeTheme = "light" | "dark";

/** IDE follows the product light-only theme. */
export function useIdeTheme(): readonly [IdeTheme, (next: IdeTheme) => void] {
  return ["light", () => undefined] as const;
}
