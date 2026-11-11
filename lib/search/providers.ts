/**
 * Pluggable search providers for chat Search mode.
 * Configuration comes from environment variables only; there is no silent
 * fallback to another provider when SEARCH_PROVIDER is unset or invalid.
 */

import { fetchJson } from "@/lib/research/net";

export type SearchProviderId = "searxng" | "tavily";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  /** Page text the provider already returned, when available. */
  content?: string;
};

export type SearchProvider = {
  id: SearchProviderId;
  search: (query: string, limit: number, signal?: AbortSignal) => Promise<SearchResult[]>;
};

export class SearchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchConfigError";
  }
}

function providerId(): SearchProviderId | null {
  const value = (process.env.SEARCH_PROVIDER ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "searxng" || value === "tavily") return value;
  throw new SearchConfigError(
    `SEARCH_PROVIDER="${process.env.SEARCH_PROVIDER}" is not supported. Use searxng or tavily.`,
  );
}

async function searxngSearch(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]> {
  const base = (process.env.SEARXNG_URL ?? "").trim().replace(/\/$/, "");
  if (!base) {
    throw new SearchConfigError("Search is unavailable: SEARXNG_URL is not set.");
  }
  const url = new URL("search", `${base}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  const data = await fetchJson<{ results?: { url: string; title?: string; content?: string }[] }>(url.toString(), {
    trusted: true,
    signal,
  });
  return (data.results ?? []).slice(0, limit).map((item) => ({
    url: item.url,
    title: item.title ?? item.url,
    snippet: item.content ?? "",
  }));
}

async function tavilySearch(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]> {
  const key = (process.env.TAVILY_API_KEY ?? "").trim();
  if (!key) {
    throw new SearchConfigError("Search is unavailable: TAVILY_API_KEY is not set.");
  }
  const data = await fetchJson<{ results?: { url: string; title?: string; content?: string; raw_content?: string | null }[] }>(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: limit, include_raw_content: true, search_depth: "basic" }),
      signal,
    },
  );
  return (data.results ?? []).map((item) => ({
    url: item.url,
    title: item.title ?? item.url,
    snippet: item.content ?? "",
    content: item.raw_content?.slice(0, 60_000) || undefined,
  }));
}

/** Resolves the configured provider, or null when Search has not been set up. */
export function configuredSearchProvider(): SearchProvider | null {
  const id = providerId();
  if (!id) return null;
  if (id === "searxng") return { id, search: searxngSearch };
  return { id, search: tavilySearch };
}

/** Why the Search toggle cannot run, or null when it can. */
export function searchUnavailableReason(): string | null {
  try {
    if (!configuredSearchProvider()) {
      return "Search is unavailable because no provider has been configured. Set SEARCH_PROVIDER to searxng or tavily.";
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Search is unavailable.";
  }
}
