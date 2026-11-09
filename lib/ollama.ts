import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { disabledModelNames } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { getOllamaBaseOverride } from "@/lib/providers/store";

export function ollamaRoot() {
  let override = "";
  try {
    override = getOllamaBaseOverride() ?? "";
  } catch {
    override = "";
  }
  return (override || env.OLLAMA_BASE_URL).replace(/\/$/, "").replace(/\/v1$/, "");
}

export function getModelName() {
  return env.OLLAMA_MODEL;
}

const clients = new Map<string, ReturnType<typeof createOpenAICompatible>>();

/** A client for the current Ollama address, so an admin base-URL change takes effect. */
export function getChatModel(name: string) {
  const baseURL = `${ollamaRoot()}/v1`;
  let client = clients.get(baseURL);
  if (!client) {
    client = createOpenAICompatible({
      name: "ollama",
      baseURL,
      apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
      includeUsage: true,
    });
    clients.set(baseURL, client);
  }
  return client.chatModel(name);
}

export type InstalledModel = {
  name: string;
  size: number;
  parameterSize: string | null;
  family: string | null;
  quantization: string | null;
};

type Inventory =
  | { ok: true; models: InstalledModel[] }
  | { ok: false; error: string };

type TagsResponse = {
  models?: {
    name: string;
    size?: number;
    details?: {
      family?: string;
      families?: string[] | null;
      parameter_size?: string;
      quantization_level?: string;
    };
  }[];
};

/** "7.6B" -> 7.6e9, "567M" -> 5.67e8. Unknown sizes return null. */
function parseParameterCount(value: string | undefined) {
  const match = value?.trim().match(/^([\d.]+)\s*([KMBT])?$/i);
  if (!match) return null;
  const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[
    (match[2] ?? "").toUpperCase() as "K" | "M" | "B" | "T"
  ];
  return Number(match[1]) * (scale ?? 1);
}

const EMBEDDING_FAMILIES = new Set(["bert", "nomic-bert", "jina-bert"]);

// gemma3:1b reports 999.89M, so the floor sits just under one billion.
const MIN_PARAMETERS = 0.9e9;

function isChatModel(model: NonNullable<TagsResponse["models"]>[number]) {
  if (/embed|rerank/i.test(model.name)) return false;
  const families = [model.details?.family, ...(model.details?.families ?? [])];
  if (families.some((family) => family && EMBEDDING_FAMILIES.has(family))) {
    return false;
  }
  const count = parseParameterCount(model.details?.parameter_size);
  return count === null || count >= MIN_PARAMETERS;
}

async function fetchInventory(): Promise<Inventory> {
  try {
    const response = await fetch(`${ollamaRoot()}/api/tags`, {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: "Ollama is running but rejected the model list request.",
      };
    }
    const data = (await response.json()) as TagsResponse;
    const models = (data.models ?? [])
      .filter(isChatModel)
      .map((model) => ({
        name: model.name,
        size: model.size ?? 0,
        parameterSize: model.details?.parameter_size ?? null,
        family: model.details?.family ?? null,
        quantization: model.details?.quantization_level ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, models };
  } catch {
    return {
      ok: false,
      error: `Cannot reach Ollama at ${ollamaRoot()}. Start it with "ollama serve" or "brew services start ollama".`,
    };
  }
}

const cache = globalThis as typeof globalThis & {
  harborInventory?: { at: number; value: Inventory };
};

export async function getInventory() {
  const cached = cache.harborInventory;
  if (cached && Date.now() - cached.at < 5000) return cached.value;
  const value = await fetchInventory();
  cache.harborInventory = { at: Date.now(), value };
  return value;
}

export function invalidateInventory() {
  cache.harborInventory = undefined;
}

const capabilityCache = globalThis as typeof globalThis & {
  harborCapabilities?: Map<string, string[]>;
};
const capabilities = (capabilityCache.harborCapabilities ??= new Map<string, string[]>());

/** What Ollama says a model can do, e.g. ["completion", "vision", "tools"]. Empty when unknown. */
export async function modelCapabilities(name: string): Promise<string[]> {
  const key = `${ollamaRoot()}|${name}`;
  const cached = capabilities.get(key);
  if (cached) return cached;
  try {
    const response = await fetch(`${ollamaRoot()}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { capabilities?: string[] };
    const list = Array.isArray(data.capabilities) ? data.capabilities : [];
    capabilities.set(key, list);
    return list;
  } catch {
    return [];
  }
}

/** Installed models minus the ones an admin has disabled. */
export async function getUserInventory(): Promise<Inventory> {
  const inventory = await getInventory();
  if (!inventory.ok) return inventory;
  const disabled = disabledModelNames();
  return { ok: true, models: inventory.models.filter((model) => !disabled.has(model.name)) };
}

function sameModel(installed: string, wanted: string) {
  return (
    installed === wanted ||
    installed === `${wanted}:latest` ||
    wanted === `${installed}:latest`
  );
}

export function findInstalled(models: InstalledModel[], wanted: string | null | undefined) {
  if (!wanted) return undefined;
  return models.find((model) => sameModel(model.name, wanted));
}

/** Picks the requested model, then the server default, then any installed chat model. */
export function resolveModel(models: InstalledModel[], ...preferred: (string | null | undefined)[]) {
  for (const wanted of [...preferred, getModelName()]) {
    const match = findInstalled(models, wanted);
    if (match) return match.name;
  }
  return models[0]?.name ?? null;
}

type OllamaStatus = { ok: true } | { ok: false; error: string };

export async function checkOllama(): Promise<OllamaStatus> {
  const inventory = await getUserInventory();
  if (!inventory.ok) return inventory;
  if (inventory.models.length === 0) {
    return {
      ok: false,
      error: "No chat models are available. An admin can install or enable one under Models.",
    };
  }
  return { ok: true };
}
