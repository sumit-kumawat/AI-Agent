import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/secrets";

const KEY = "research.config";

export const SOURCE_IDS = ["wikipedia", "searxng", "tavily", "brave"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_NAMES: Record<SourceId, string> = {
  wikipedia: "Wikipedia",
  searxng: "SearXNG",
  tavily: "Tavily",
  brave: "Brave Search",
};

type Stored = {
  wikipedia: { enabled: boolean; language: string };
  searxng: { enabled: boolean; baseUrl: string | null };
  tavily: { enabled: boolean; keyEnc: string | null; keyHint: string | null };
  brave: { enabled: boolean; keyEnc: string | null; keyHint: string | null };
  /** Results read per research run. */
  maxSources: number;
};

const DEFAULTS: Stored = {
  wikipedia: { enabled: true, language: "en" },
  searxng: { enabled: false, baseUrl: null },
  tavily: { enabled: false, keyEnc: null, keyHint: null },
  brave: { enabled: false, keyEnc: null, keyHint: null },
  maxSources: 8,
};

function load(): Stored {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  if (!row) return structuredClone(DEFAULTS);
  try {
    const value = JSON.parse(row.value) as Partial<Stored>;
    return {
      wikipedia: { ...DEFAULTS.wikipedia, ...value.wikipedia },
      searxng: { ...DEFAULTS.searxng, ...value.searxng },
      tavily: { ...DEFAULTS.tavily, ...value.tavily },
      brave: { ...DEFAULTS.brave, ...value.brave },
      maxSources: value.maxSources ?? DEFAULTS.maxSources,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save(value: Stored) {
  const now = Date.now();
  db.insert(settings)
    .values({ key: KEY, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), updatedAt: now } })
    .run();
}

/** What the admin page may see: no keys, only hints. */
export type PublicResearchConfig = {
  wikipedia: { enabled: boolean; language: string };
  searxng: { enabled: boolean; baseUrl: string | null };
  tavily: { enabled: boolean; keyHint: string | null };
  brave: { enabled: boolean; keyHint: string | null };
  maxSources: number;
};

export function publicResearchConfig(): PublicResearchConfig {
  const value = load();
  return {
    wikipedia: value.wikipedia,
    searxng: value.searxng,
    tavily: { enabled: value.tavily.enabled, keyHint: value.tavily.keyHint },
    brave: { enabled: value.brave.enabled, keyHint: value.brave.keyHint },
    maxSources: value.maxSources,
  };
}

export type ResearchConfigPatch = {
  wikipedia?: { enabled: boolean; language: string };
  searxng?: { enabled: boolean; baseUrl: string | null };
  tavily?: { enabled: boolean; key?: string | null };
  brave?: { enabled: boolean; key?: string | null };
  maxSources?: number;
};

/** A key of undefined keeps the saved one; null removes it. */
export function updateResearchConfig(patch: ResearchConfigPatch) {
  const value = load();
  if (patch.wikipedia) value.wikipedia = patch.wikipedia;
  if (patch.searxng) value.searxng = patch.searxng;
  for (const id of ["tavily", "brave"] as const) {
    const next = patch[id];
    if (!next) continue;
    value[id].enabled = next.enabled;
    if (next.key === null) {
      value[id].keyEnc = null;
      value[id].keyHint = null;
    } else if (next.key) {
      value[id].keyEnc = encryptSecret(next.key.trim());
      value[id].keyHint = secretHint(next.key);
    }
  }
  if (patch.maxSources !== undefined) value.maxSources = patch.maxSources;
  save(value);
  return publicResearchConfig();
}

export type ActiveSource =
  | { id: "wikipedia"; language: string }
  | { id: "searxng"; baseUrl: string }
  | { id: "tavily"; key: string }
  | { id: "brave"; key: string };

/** Enabled sources that have what they need to run. Keys are decrypted here and never leave the server. */
export function activeSources(): ActiveSource[] {
  const value = load();
  const list: ActiveSource[] = [];
  if (value.wikipedia.enabled) list.push({ id: "wikipedia", language: value.wikipedia.language || "en" });
  if (value.searxng.enabled && value.searxng.baseUrl) list.push({ id: "searxng", baseUrl: value.searxng.baseUrl });
  for (const id of ["tavily", "brave"] as const) {
    const entry = value[id];
    if (!entry.enabled || !entry.keyEnc) continue;
    try {
      list.push({ id, key: decryptSecret(entry.keyEnc) });
    } catch {
      // Key encrypted with a different secret; the admin has to enter it again.
    }
  }
  return list;
}

export function maxSources() {
  return Math.min(15, Math.max(3, load().maxSources));
}
