import { SOURCE_NAMES, type ActiveSource, type SourceId } from "@/lib/research/config";
import { htmlToText, stripTags } from "@/lib/research/html";
import { FetchFailed, fetchJson, safeFetch } from "@/lib/research/net";

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  source: SourceId;
  /** Text the search API already returned: a Wikipedia intro, or Tavily's page content. */
  content?: string;
  wiki?: { language: string; pageId: number };
};

const MAX_PAGE_CHARS = 60_000;

function wikiBase(language: string) {
  const lang = /^[a-z]{2,3}(-[a-z]+)?$/.test(language) ? language : "en";
  return `https://${lang}.wikipedia.org/w/api.php`;
}

async function searchWikipedia(source: Extract<ActiveSource, { id: "wikipedia" }>, query: string, limit: number) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(limit),
    format: "json",
    formatversion: "2",
  });
  const data = await fetchJson<{ query?: { search?: { title: string; pageid: number; snippet: string }[] } }>(
    `${wikiBase(source.language)}?${params}`,
  );
  const results = data.query?.search ?? [];
  if (results.length === 0) return [];
  // Wikipedia returns several extracts per request only for introductions; full articles are read later, one at a time.
  const extracts = await fetchJson<{ query?: { pages?: { pageid: number; extract?: string; fullurl?: string }[] } }>(
    `${wikiBase(source.language)}?${new URLSearchParams({
      action: "query",
      prop: "extracts|info",
      inprop: "url",
      exintro: "1",
      explaintext: "1",
      exlimit: "max",
      pageids: results.map((item) => item.pageid).join("|"),
      format: "json",
      formatversion: "2",
    })}`,
  );
  const pages = new Map((extracts.query?.pages ?? []).map((page) => [page.pageid, page]));
  return results.map((item) => {
    const page = pages.get(item.pageid);
    return {
      url: page?.fullurl ?? `https://${source.language}.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(" ", "_"))}`,
      title: item.title,
      snippet: stripTags(item.snippet),
      source: "wikipedia" as const,
      content: page?.extract?.slice(0, MAX_PAGE_CHARS) || undefined,
      wiki: { language: source.language, pageId: item.pageid },
    };
  });
}

async function searchSearxng(source: Extract<ActiveSource, { id: "searxng" }>, query: string, limit: number) {
  const url = new URL("search", source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  const data = await fetchJson<{ results?: { url: string; title?: string; content?: string }[] }>(url.toString(), {
    trusted: true,
  });
  return (data.results ?? []).slice(0, limit).map((item) => ({
    url: item.url,
    title: item.title ?? item.url,
    snippet: item.content ?? "",
    source: "searxng" as const,
  }));
}

async function searchTavily(source: Extract<ActiveSource, { id: "tavily" }>, query: string, limit: number) {
  const data = await fetchJson<{ results?: { url: string; title?: string; content?: string; raw_content?: string | null }[] }>(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${source.key}` },
      body: JSON.stringify({ query, max_results: limit, include_raw_content: true, search_depth: "basic" }),
    },
  );
  return (data.results ?? []).map((item) => ({
    url: item.url,
    title: item.title ?? item.url,
    snippet: item.content ?? "",
    source: "tavily" as const,
    content: item.raw_content?.slice(0, MAX_PAGE_CHARS) || undefined,
  }));
}

async function searchBrave(source: Extract<ActiveSource, { id: "brave" }>, query: string, limit: number) {
  const data = await fetchJson<{ web?: { results?: { url: string; title?: string; description?: string }[] } }>(
    `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(limit) })}`,
    { headers: { "X-Subscription-Token": source.key } },
  );
  return (data.web?.results ?? []).map((item) => ({
    url: item.url,
    title: stripTags(item.title ?? item.url),
    snippet: stripTags(item.description ?? ""),
    source: "brave" as const,
  }));
}

export async function search(source: ActiveSource, query: string, limit = 5): Promise<SearchHit[]> {
  try {
    return await searchOnce(source, query, limit);
  } catch (error) {
    // Public APIs rate-limit bursts; one short pause usually clears it.
    if (!(error instanceof FetchFailed) || !/HTTP (429|503)/.test(error.message)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return searchOnce(source, query, limit);
  }
}

function searchOnce(source: ActiveSource, query: string, limit: number): Promise<SearchHit[]> {
  switch (source.id) {
    case "wikipedia":
      return searchWikipedia(source, query, limit);
    case "searxng":
      return searchSearxng(source, query, limit);
    case "tavily":
      return searchTavily(source, query, limit);
    case "brave":
      return searchBrave(source, query, limit);
  }
}

export function sourceError(source: ActiveSource, error: unknown) {
  const reason = error instanceof FetchFailed ? error.message : "Unexpected response.";
  return `${SOURCE_NAMES[source.id]}: ${reason}`;
}

/** Full text of a result: the whole Wikipedia article, the page itself, or what the search API returned. */
export async function readHit(hit: SearchHit, signal?: AbortSignal) {
  if (hit.wiki) {
    const data = await fetchJson<{ query?: { pages?: { extract?: string }[] } }>(
      `${wikiBase(hit.wiki.language)}?${new URLSearchParams({
        action: "query",
        prop: "extracts",
        explaintext: "1",
        exsectionformat: "plain",
        pageids: String(hit.wiki.pageId),
        format: "json",
        formatversion: "2",
      })}`,
      { signal },
    );
    const text = data.query?.pages?.[0]?.extract ?? "";
    if (!text) throw new FetchFailed("Article text was empty.");
    return { url: hit.url, title: hit.title, text: text.slice(0, MAX_PAGE_CHARS) };
  }
  if (hit.content && hit.content.length > 2000) return { url: hit.url, title: hit.title, text: hit.content };
  return readPage(hit.url, signal);
}

/** Text of a result page. Throws FetchFailed with a short reason. */
export async function readPage(url: string, signal?: AbortSignal) {
  const response = await safeFetch(url, { signal, timeoutMs: 12_000 });
  if (!response.ok) throw new FetchFailed(`HTTP ${response.status}`);
  const type = response.contentType.toLowerCase();
  const raw = response.body.toString("utf8");
  if (type.includes("html") || /^\s*<(!doctype|html)/i.test(raw)) {
    const page = htmlToText(raw);
    return { url: response.url, title: page.title, text: page.text.slice(0, MAX_PAGE_CHARS) };
  }
  if (type.startsWith("text/") || type.includes("json")) {
    return { url: response.url, title: "", text: raw.slice(0, MAX_PAGE_CHARS) };
  }
  throw new FetchFailed("Not a readable web page.");
}

/** A quick query against one source, for the admin page and the composer's availability check. */
export async function checkSource(source: ActiveSource) {
  const started = Date.now();
  try {
    const hits = await search(source, "photosynthesis", 1);
    if (hits.length === 0) return { ok: false, error: "Answered but returned no results.", ms: Date.now() - started };
    return { ok: true, error: null, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, error: sourceError(source, error), ms: Date.now() - started };
  }
}
