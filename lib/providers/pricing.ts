/**
 * Public list prices in USD per million tokens, used as a starting point when
 * a model is first discovered. Dated snapshots (`gpt-4o-mini-2024-07-18`)
 * match the base id. Unknown models stay unpriced until an admin sets one.
 */
const PRICES: { id: string; input: number; output: number }[] = [
  { id: "gpt-4o-mini", input: 0.15, output: 0.6 },
  { id: "gpt-4o", input: 2.5, output: 10 },
  { id: "gpt-4.1-nano", input: 0.1, output: 0.4 },
  { id: "gpt-4.1-mini", input: 0.4, output: 1.6 },
  { id: "gpt-4.1", input: 2, output: 8 },
  { id: "o4-mini", input: 1.1, output: 4.4 },
  { id: "o3-mini", input: 1.1, output: 4.4 },
  { id: "o1-mini", input: 1.1, output: 4.4 },
  { id: "claude-3-5-haiku", input: 0.8, output: 4 },
  { id: "claude-3-5-sonnet", input: 3, output: 15 },
  { id: "claude-3-haiku", input: 0.25, output: 1.25 },
  { id: "claude-haiku", input: 1, output: 5 },
  { id: "claude-sonnet", input: 3, output: 15 },
  { id: "claude-opus", input: 15, output: 75 },
  { id: "gemini-2.0-flash-lite", input: 0.075, output: 0.3 },
  { id: "gemini-2.0-flash", input: 0.1, output: 0.4 },
  { id: "gemini-2.5-flash", input: 0.3, output: 2.5 },
  { id: "gemini-2.5-pro", input: 1.25, output: 10 },
  { id: "gemini-1.5-flash", input: 0.075, output: 0.3 },
  { id: "gemini-1.5-pro", input: 1.25, output: 5 },
];

export function defaultPrice(modelId: string) {
  const id = modelId.toLowerCase().replace(/^models\//, "");
  const match = PRICES.filter((price) => id === price.id || id.startsWith(`${price.id}-`)).sort(
    (a, b) => b.id.length - a.id.length,
  )[0];
  return match ? { input: match.input, output: match.output } : null;
}

/** Models offered automatically the first time a provider connects, if it actually lists them. */
export const RECOMMENDED: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o", "gpt-4.1"],
  anthropic: ["claude-haiku", "claude-sonnet"],
  google: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
};

export function isRecommended(kind: string, modelId: string) {
  const id = modelId.toLowerCase();
  return (RECOMMENDED[kind] ?? []).some((prefix) => id === prefix || id.startsWith(`${prefix}-`));
}
