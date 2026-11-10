import { activeSources, SOURCE_NAMES, type SourceId } from "@/lib/research/config";
import { checkSource } from "@/lib/research/sources";

export type SourceStatus = { id: SourceId; name: string; ok: boolean; error: string | null; ms: number; checkedAt: number };

const TTL_MS = 5 * 60 * 1000;
const store = globalThis as typeof globalThis & { xaiResearchHealth?: Map<string, SourceStatus> };
const cache = (store.xaiResearchHealth ??= new Map<string, SourceStatus>());

function cacheKey(source: ReturnType<typeof activeSources>[number]) {
  return source.id === "searxng" ? `searxng|${source.baseUrl}` : source.id === "wikipedia" ? `wikipedia|${source.language}` : source.id;
}

/** Runs a test query against each configured source; results are reused for five minutes unless `fresh`. */
export async function sourceStatuses(fresh = false): Promise<SourceStatus[]> {
  const sources = activeSources();
  return Promise.all(
    sources.map(async (source) => {
      const key = cacheKey(source);
      const cached = cache.get(key);
      if (!fresh && cached && Date.now() - cached.checkedAt < TTL_MS) return cached;
      const result = await checkSource(source);
      const status: SourceStatus = { id: source.id, name: SOURCE_NAMES[source.id], ...result, checkedAt: Date.now() };
      cache.set(key, status);
      return status;
    }),
  );
}

export function clearSourceStatuses() {
  cache.clear();
}
