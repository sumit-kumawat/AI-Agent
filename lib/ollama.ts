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
  xaiInventory?: { at: number; value: Inventory };
};

export async function getInventory() {
  const cached = cache.xaiInventory;
  if (cached && Date.now() - cached.at < 5000) return cached.value;
  const value = await fetchInventory();
  cache.xaiInventory = { at: Date.now(), value };
  return value;
}

export function invalidateInventory() {
  cache.xaiInventory = undefined;
}

/** What Ollama's /api/show reports about one installed model. */
export type ModelInfo = {
  /** e.g. ["completion", "vision", "tools", "thinking"]. */
  capabilities: string[];
  /** The longest context the model was trained for (model_info.<arch>.context_length). */
  maxContext: number | null;
  /** num_ctx set in the model's Modelfile, which Ollama uses instead of its default. */
  numCtx: number | null;
};

const infoCache = globalThis as typeof globalThis & { xaiModelInfo?: Map<string, ModelInfo> };
const infos = (infoCache.xaiModelInfo ??= new Map<string, ModelInfo>());
const UNKNOWN: ModelInfo = { capabilities: [], maxContext: null, numCtx: null };

export async function modelInfo(name: string): Promise<ModelInfo> {
  const key = `${ollamaRoot()}|${name}`;
  const cached = infos.get(key);
  if (cached) return cached;
  try {
    const response = await fetch(`${ollamaRoot()}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) return UNKNOWN;
    const data = (await response.json()) as {
      capabilities?: string[];
      model_info?: Record<string, unknown>;
      parameters?: string;
    };
    const contextKey = Object.keys(data.model_info ?? {}).find((field) => field.endsWith(".context_length"));
    const max = contextKey ? Number(data.model_info![contextKey]) : NaN;
    const numCtx = Number(/(?:^|\n)\s*num_ctx\s+(\d+)/.exec(data.parameters ?? "")?.[1] ?? NaN);
    const info: ModelInfo = {
      capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
      maxContext: Number.isFinite(max) && max > 0 ? max : null,
      numCtx: Number.isFinite(numCtx) && numCtx > 0 ? numCtx : null,
    };
    infos.set(key, info);
    return info;
  } catch {
    return UNKNOWN;
  }
}

/** What Ollama says a model can do, e.g. ["completion", "vision", "tools"]. Empty when unknown. */
export async function modelCapabilities(name: string): Promise<string[]> {
  return (await modelInfo(name)).capabilities;
}

const runningCache = globalThis as typeof globalThis & {
  xaiRunning?: { at: number; models: Map<string, number> };
};

/** Models Ollama holds in memory right now, with the context window each was loaded with. */
export async function runningModels(): Promise<Map<string, number>> {
  const cached = runningCache.xaiRunning;
  if (cached && Date.now() - cached.at < 3000) return cached.models;
  const models = new Map<string, number>();
  try {
    const response = await fetch(`${ollamaRoot()}/api/ps`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { models?: { name: string; context_length?: number }[] };
      for (const model of data.models ?? []) models.set(model.name, Number(model.context_length) || 0);
    }
  } catch {
    // Treated as nothing loaded; the inventory check reports Ollama being down.
  }
  runningCache.xaiRunning = { at: Date.now(), models };
  return models;
}

export type LoadedModel = { name: string; sizeBytes: number; vramBytes: number; contextLength: number | null; expiresAt: number | null };

/** Ollama's version and what it holds in memory right now, uncached. Null when unreachable. */
export async function runtimeDetails(): Promise<{ version: string | null; loaded: LoadedModel[]; checkedAt: number } | null> {
  try {
    const [ps, version] = await Promise.all([
      fetch(`${ollamaRoot()}/api/ps`, { signal: AbortSignal.timeout(2000), cache: "no-store" }),
      fetch(`${ollamaRoot()}/api/version`, { signal: AbortSignal.timeout(2000), cache: "no-store" }).catch(() => null),
    ]);
    if (!ps.ok) return null;
    const data = (await ps.json()) as {
      models?: { name: string; size?: number; size_vram?: number; context_length?: number; expires_at?: string }[];
    };
    const versionBody = version?.ok ? ((await version.json().catch(() => null)) as { version?: string } | null) : null;
    delete runningCache.xaiRunning;
    return {
      checkedAt: Date.now(),
      version: versionBody?.version ?? null,
      loaded: (data.models ?? []).map((model) => {
        const expires = model.expires_at ? Date.parse(model.expires_at) : NaN;
        return {
          name: model.name,
          sizeBytes: Number(model.size) || 0,
          vramBytes: Number(model.size_vram) || 0,
          contextLength: Number(model.context_length) || null,
          expiresAt: Number.isFinite(expires) ? expires : null,
        };
      }),
    };
  } catch {
    return null;
  }
}

/** Loads a model into memory (`keepAlive` such as "30m") or unloads it ("0"). Waits for Ollama to finish. */
export async function setModelResidency(name: string, keepAlive: string) {
  const response = await fetch(`${ollamaRoot()}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: name, keep_alive: keepAlive }),
    signal: AbortSignal.timeout(180_000),
  });
  delete runningCache.xaiRunning;
  if (!response.ok) {
    const detail = ((await response.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(detail ?? `Ollama answered ${response.status}.`);
  }
  await response.body?.cancel().catch(() => undefined);
}

/** Models Ollama currently holds in memory. Empty when Ollama cannot be reached. */
export async function loadedModels(): Promise<Set<string>> {
  return new Set((await runningModels()).keys());
}

const defaultCache = globalThis as typeof globalThis & { xaiDefaultContext?: number };

/**
 * The context window Ollama gives models without their own num_ctx. Learned
 * from a running model that was loaded with less than its maximum, which can
 * only be the server default. Null until one has been seen.
 */
export async function serverDefaultContext(): Promise<number | null> {
  const running = await runningModels();
  for (const [name, length] of running) {
    if (!length) continue;
    const info = await modelInfo(name);
    if (info.numCtx === null && info.maxContext !== null && length < info.maxContext) {
      defaultCache.xaiDefaultContext = length;
      break;
    }
  }
  return defaultCache.xaiDefaultContext ?? null;
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
