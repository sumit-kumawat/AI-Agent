import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { providerModels, providers, settings } from "@/lib/db/schema";
import { encryptSecret, secretHint } from "@/lib/secrets";
import { defaultPrice, isRecommended } from "@/lib/providers/pricing";

export const PROVIDER_KINDS = ["ollama", "openai", "anthropic", "google", "compatible"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

const BUILT_IN = new Set<ProviderKind>(["ollama", "openai", "anthropic", "google"]);

export type ProviderRecord = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  apiKeyEnc: string | null;
  apiKeyHint: string | null;
  enabled: boolean;
  healthOk: boolean | null;
  healthAt: number | null;
  healthError: string | null;
};

export type ProviderModelRecord = {
  providerId: string;
  modelId: string;
  enabled: boolean;
  available: boolean;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
};

export type PublicProvider = Omit<ProviderRecord, "apiKeyEnc"> & {
  hasKey: boolean;
  models: ProviderModelRecord[];
};

function toRecord(row: typeof providers.$inferSelect): ProviderRecord {
  return {
    id: row.id,
    kind: row.kind as ProviderKind,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKeyEnc: row.apiKeyEnc,
    apiKeyHint: row.apiKeyHint,
    enabled: row.enabled,
    healthOk: row.healthOk,
    healthAt: row.healthAt,
    healthError: row.healthError,
  };
}

export function listProviders(): ProviderRecord[] {
  return db.select().from(providers).orderBy(asc(providers.createdAt), asc(providers.name)).all().map(toRecord);
}

export function getProvider(id: string) {
  const row = db.select().from(providers).where(eq(providers.id, id)).get();
  return row ? toRecord(row) : undefined;
}

export function getOllamaBaseOverride() {
  return db.select({ baseUrl: providers.baseUrl }).from(providers).where(eq(providers.id, "ollama")).get()?.baseUrl ?? null;
}

export function listProviderModels(providerId: string): ProviderModelRecord[] {
  return db
    .select({
      providerId: providerModels.providerId,
      modelId: providerModels.modelId,
      enabled: providerModels.enabled,
      available: providerModels.available,
      inputPerMillion: providerModels.inputPerMillion,
      outputPerMillion: providerModels.outputPerMillion,
    })
    .from(providerModels)
    .where(eq(providerModels.providerId, providerId))
    .orderBy(asc(providerModels.modelId))
    .all();
}

/** What the browser is allowed to see. The encrypted key is never included. */
export function publicProviders(): PublicProvider[] {
  return listProviders().map(({ apiKeyEnc, ...provider }) => ({
    ...provider,
    hasKey: apiKeyEnc !== null,
    models: listProviderModels(provider.id),
  }));
}

export function isBuiltIn(kind: ProviderKind) {
  return BUILT_IN.has(kind);
}

export class ProviderError extends Error {}

export function assertProviderUrl(kind: ProviderKind, value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderError("Enter a full URL, including http:// or https://.");
  }
  if (url.username || url.password) throw new ProviderError("Put the API key in the key field, not the URL.");
  const host = url.hostname.toLowerCase();
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    throw new ProviderError("That address is not allowed.");
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  if (kind === "ollama" || kind === "compatible") {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new ProviderError("Use an http or https URL.");
  } else if (url.protocol !== "https:" || local) {
    throw new ProviderError("Cloud providers use their public https endpoint.");
  }
  return url.toString().replace(/\/$/, "");
}

export function saveProvider(
  id: string,
  patch: { name?: string; baseUrl?: string | null; enabled?: boolean; apiKey?: string | null },
) {
  const provider = getProvider(id) ?? (() => { throw new ProviderError("That provider does not exist."); })();
  const set: Partial<typeof providers.$inferInsert> = { updatedAt: Date.now() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 60) throw new ProviderError("Name must be 1 to 60 characters.");
    set.name = name;
  }
  if (patch.baseUrl !== undefined) {
    set.baseUrl = patch.baseUrl ? assertProviderUrl(provider.kind, patch.baseUrl) : null;
  }
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.apiKey !== undefined) {
    if (!patch.apiKey) {
      set.apiKeyEnc = null;
      set.apiKeyHint = null;
    } else {
      const key = patch.apiKey.trim();
      if (key.length < 8 || key.length > 400) throw new ProviderError("The API key should be 8 to 400 characters.");
      set.apiKeyEnc = encryptSecret(key);
      set.apiKeyHint = secretHint(key);
    }
  }
  db.update(providers).set(set).where(eq(providers.id, id)).run();
  return getProvider(id)!;
}

export function createCompatibleProvider(input: { name: string; baseUrl: string; apiKey: string }) {
  const name = input.name.trim();
  if (!name || name.length > 60) throw new ProviderError("Name must be 1 to 60 characters.");
  const baseUrl = assertProviderUrl("compatible", input.baseUrl);
  const key = input.apiKey.trim();
  if (key.length < 8 || key.length > 400) throw new ProviderError("The API key should be 8 to 400 characters.");
  const now = Date.now();
  const id = `c${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  db.insert(providers)
    .values({
      id,
      kind: "compatible",
      name,
      baseUrl,
      apiKeyEnc: encryptSecret(key),
      apiKeyHint: secretHint(key),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getProvider(id)!;
}

export function deleteProvider(id: string) {
  const provider = getProvider(id);
  if (!provider) throw new ProviderError("That provider does not exist.");
  if (provider.kind !== "compatible") throw new ProviderError("Built-in providers can be turned off, not deleted.");
  db.delete(providers).where(eq(providers.id, id)).run();
}

export function setProviderHealth(id: string, ok: boolean, error: string | null) {
  db.update(providers)
    .set({ healthOk: ok, healthError: error, healthAt: Date.now(), updatedAt: Date.now() })
    .where(eq(providers.id, id))
    .run();
}

/** Replaces the discovered set. Custom prices and enablement of models that are still listed are kept. */
export function replaceDiscoveredModels(
  providerId: string,
  kind: ProviderKind,
  discovered: string[],
  recommend: boolean,
) {
  const existing = new Map(listProviderModels(providerId).map((model) => [model.modelId, model]));
  const offerDefaults = recommend && ![...existing.values()].some((model) => model.enabled);
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(providerModels)
      .set({ available: false })
      .where(eq(providerModels.providerId, providerId))
      .run();
    for (const modelId of discovered) {
      const previous = existing.get(modelId);
      const price = defaultPrice(modelId);
      tx.insert(providerModels)
        .values({
          providerId,
          modelId,
          enabled: previous?.enabled ?? (offerDefaults && isRecommended(kind, modelId)),
          available: true,
          inputPerMillion: previous?.inputPerMillion ?? price?.input ?? null,
          outputPerMillion: previous?.outputPerMillion ?? price?.output ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [providerModels.providerId, providerModels.modelId],
          set: { available: true, updatedAt: now },
        })
        .run();
    }
  });
}

export function updateProviderModel(
  providerId: string,
  modelId: string,
  patch: { enabled?: boolean; inputPerMillion?: number | null; outputPerMillion?: number | null },
) {
  const set: Partial<typeof providerModels.$inferInsert> = { updatedAt: Date.now() };
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.inputPerMillion !== undefined) set.inputPerMillion = patch.inputPerMillion;
  if (patch.outputPerMillion !== undefined) set.outputPerMillion = patch.outputPerMillion;
  return (
    db
      .update(providerModels)
      .set(set)
      .where(and(eq(providerModels.providerId, providerId), eq(providerModels.modelId, modelId)))
      .run().changes > 0
  );
}

export type ModelRef = { providerId: string; modelId: string };

function readRef(key: string): ModelRef | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as ModelRef;
    if (value && typeof value.providerId === "string" && typeof value.modelId === "string") return value;
  } catch {
    return null;
  }
  return null;
}

function writeRef(key: string, value: ModelRef | null) {
  const now = Date.now();
  if (!value) {
    db.delete(settings).where(eq(settings.key, key)).run();
    return;
  }
  db.insert(settings)
    .values({ key, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), updatedAt: now } })
    .run();
}

export function getRouting() {
  return {
    defaultModel: readRef("models.default"),
    fallbackModel: readRef("models.fallback"),
  };
}

export function setRouting(routing: { defaultModel: ModelRef | null; fallbackModel: ModelRef | null }) {
  writeRef("models.default", routing.defaultModel);
  writeRef("models.fallback", routing.fallbackModel);
}

export function modelPrice(providerId: string, modelId: string) {
  return db
    .select({
      inputPerMillion: providerModels.inputPerMillion,
      outputPerMillion: providerModels.outputPerMillion,
    })
    .from(providerModels)
    .where(and(eq(providerModels.providerId, providerId), eq(providerModels.modelId, modelId)))
    .get();
}
