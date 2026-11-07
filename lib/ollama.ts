import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "@/lib/env";

export function ollamaRoot() {
  return env.OLLAMA_BASE_URL.replace(/\/$/, "").replace(/\/v1$/, "");
}

export function getModelName() {
  return env.OLLAMA_MODEL;
}

export const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: `${ollamaRoot()}/v1`,
  apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
});

export function getChatModel() {
  return ollama.chatModel(getModelName());
}

function modelIsInstalled(names: string[], wanted: string) {
  return names.some(
    (name) =>
      name === wanted ||
      name.startsWith(`${wanted}:`) ||
      wanted.startsWith(`${name}:`),
  );
}

type OllamaStatus = { ok: true } | { ok: false; error: string };

const ollamaCache = globalThis as typeof globalThis & {
  harborOllamaCheck?: { at: number; value: OllamaStatus };
};

async function checkOllamaNow(): Promise<OllamaStatus> {
  const model = getModelName();
  try {
    const response = await fetch(`${ollamaRoot()}/api/tags`, {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: "Ollama is running but rejected the model list request.",
      };
    }
    const data = (await response.json()) as { models?: { name: string }[] };
    const names = data.models?.map((item) => item.name) ?? [];
    if (!modelIsInstalled(names, model)) {
      return {
        ok: false,
        error: `Model "${model}" is not installed. From a terminal, run: ollama pull ${model}`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: `Cannot reach Ollama at ${ollamaRoot()}. Start it with "ollama serve" or "brew services start ollama".`,
    };
  }
}

export async function checkOllama() {
  const cached = ollamaCache.harborOllamaCheck;
  if (cached && Date.now() - cached.at < 5000) return cached.value;
  const value = await checkOllamaNow();
  ollamaCache.harborOllamaCheck = { at: Date.now(), value };
  return value;
}
