import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { getChatModel } from "@/lib/ollama";
import { getProvider, modelPrice, type ProviderRecord } from "@/lib/providers/store";
import { decryptSecret, redact } from "@/lib/secrets";

const DEFAULT_BASE: Partial<Record<ProviderRecord["kind"], string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

function secretOf(provider: ProviderRecord) {
  if (!provider.apiKeyEnc) throw new Error(`${provider.name} has no API key.`);
  try {
    return decryptSecret(provider.apiKeyEnc);
  } catch {
    throw new Error(`The saved key for ${provider.name} could not be read. Enter it again.`);
  }
}

/** The AI SDK model for one turn. The key stays on the server. */
export function languageModel(providerId: string, modelId: string): LanguageModel {
  const provider = getProvider(providerId);
  if (!provider || !provider.enabled) throw new Error("That provider is not available.");
  if (provider.kind === "ollama") return getChatModel(modelId);

  const key = secretOf(provider);
  const baseURL = provider.baseUrl || DEFAULT_BASE[provider.kind];
  switch (provider.kind) {
    case "openai":
      return createOpenAI({ apiKey: key, baseURL }).chat(modelId);
    case "anthropic":
      return createAnthropic({ apiKey: key, baseURL })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey: key, baseURL })(modelId);
    case "compatible":
      if (!baseURL) throw new Error(`${provider.name} has no base URL.`);
      return createOpenAICompatible({ name: provider.id, baseURL, apiKey: key }).chatModel(modelId);
    default:
      throw new Error("That provider is not available.");
  }
}

/** Millionths of a dollar. Local models cost nothing; unpriced cloud models return null. */
export function costMicro(providerId: string, modelId: string, inputTokens: number, outputTokens: number) {
  if (providerId === "ollama") return 0;
  const price = modelPrice(providerId, modelId);
  if (!price || price.inputPerMillion === null || price.outputPerMillion === null) return null;
  const usd = (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000;
  return Math.round(usd * 1_000_000);
}

export function safeProviderError(providerId: string, error: unknown) {
  const provider = getProvider(providerId);
  let secret: string | null = null;
  if (provider?.apiKeyEnc) {
    try {
      secret = decryptSecret(provider.apiKeyEnc);
    } catch {
      secret = null;
    }
  }
  const message = error instanceof Error ? error.message : "The model stopped responding.";
  return redact(message, secret);
}
