import { getInventory, ollamaRoot } from "@/lib/ollama";
import { isRecommended } from "@/lib/providers/pricing";
import {
  getProvider,
  replaceDiscoveredModels,
  saveProvider,
  setProviderHealth,
  type ProviderKind,
  type ProviderRecord,
} from "@/lib/providers/store";
import { decryptSecret, redact } from "@/lib/secrets";

const DEFAULT_BASE: Partial<Record<ProviderKind, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

const SKIP = /embed|whisper|tts|dall-e|moderation|realtime|transcri|audio|image|rerank|sora|computer-use/i;

function baseOf(provider: ProviderRecord) {
  return (provider.baseUrl || DEFAULT_BASE[provider.kind] || "").replace(/\/$/, "");
}

function cap(kind: string, ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id && id.length <= 120))]
    .sort((a, b) => Number(isRecommended(kind, b)) - Number(isRecommended(kind, a)) || a.localeCompare(b))
    .slice(0, 200);
}

function keep(kind: ProviderKind, id: string) {
  if (SKIP.test(id)) return false;
  if (kind === "openai") return /^(gpt-|o1|o3|o4|chatgpt-)/i.test(id);
  return true;
}

async function getJson(url: string, headers: Record<string, string>, secret: string) {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: "manual", cache: "no-store" });
  } catch {
    throw new Error(`Could not reach ${new URL(url).host}.`);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error("The endpoint redirected. Check the base URL.");
  }
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 180);
    throw new Error(redact(`${response.status} ${response.statusText} ${body}`.trim(), secret));
  }
  return response.json() as Promise<unknown>;
}

function idsFrom(kind: ProviderKind, body: unknown) {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (kind === "google") {
    const models = Array.isArray(record.models) ? record.models : [];
    return models.flatMap((model) => {
      if (!model || typeof model !== "object") return [];
      const item = model as { name?: unknown; supportedGenerationMethods?: unknown };
      const methods = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : [];
      if (!methods.includes("generateContent") || typeof item.name !== "string") return [];
      return [item.name.replace(/^models\//, "")];
    });
  }
  const data = Array.isArray(record.data) ? record.data : [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") return [];
    return [(item as { id: string }).id];
  });
}

async function listModelIds(provider: ProviderRecord, secret: string) {
  const base = baseOf(provider);
  if (!base) throw new Error("Set a base URL for this provider.");
  const headers: Record<string, string> = { accept: "application/json" };
  if (provider.kind === "anthropic") {
    headers["x-api-key"] = secret;
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider.kind === "google") {
    headers["x-goog-api-key"] = secret;
  } else {
    headers.authorization = `Bearer ${secret}`;
  }

  let url = `${base}/models`;
  let body: unknown;
  try {
    body = await getJson(url, headers, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (provider.kind === "compatible" && message.startsWith("404") && !base.endsWith("/v1")) {
      url = `${base}/v1/models`;
      body = await getJson(url, headers, secret);
      saveProvider(provider.id, { baseUrl: `${base}/v1` });
    } else {
      throw error;
    }
  }
  return cap(provider.kind, idsFrom(provider.kind, body).filter((id) => keep(provider.kind, id)));
}

/** Calls the provider and records the result. A failure is a real failure, stored and shown. */
export async function checkProvider(id: string) {
  const provider = getProvider(id);
  if (!provider) return { ok: false as const, error: "That provider does not exist." };

  try {
    if (provider.kind === "ollama") {
      const inventory = await getInventory();
      if (!inventory.ok) throw new Error(inventory.error);
      setProviderHealth(id, true, null);
      return { ok: true as const, models: inventory.models.length };
    }

    if (!provider.apiKeyEnc) throw new Error("Add an API key first.");
    let secret: string;
    try {
      secret = decryptSecret(provider.apiKeyEnc);
    } catch {
      throw new Error("The saved key could not be read. Enter it again.");
    }
    const models = await listModelIds(provider, secret);
    if (models.length === 0) throw new Error("Connected, but the provider returned no chat models.");
    replaceDiscoveredModels(id, provider.kind, models, true);
    setProviderHealth(id, true, null);
    return { ok: true as const, models: models.length };
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "The connection check failed.", null);
    setProviderHealth(id, false, message);
    return { ok: false as const, error: message };
  }
}

export function providerEndpoint(provider: ProviderRecord) {
  return provider.kind === "ollama" ? ollamaRoot() : baseOf(provider);
}
