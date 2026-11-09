import { modelKey, parseModelRef, type ModelOption } from "@/lib/model-ref";
import { getModelName, getUserInventory } from "@/lib/ollama";
import { getProvider, getRouting, listProviderModels, listProviders, type ModelRef } from "@/lib/providers/store";

const downUntil = new Map<string, number>();

/** Remembers a failed call so the next message can use the fallback without waiting. */
export function noteProviderFailure(providerId: string) {
  downUntil.set(providerId, Date.now() + 2 * 60 * 1000);
}

export function providerIsDown(providerId: string) {
  if ((downUntil.get(providerId) ?? 0) > Date.now()) return true;
  return getProvider(providerId)?.healthOk === false;
}

function sameOllama(installed: string, wanted: string) {
  return installed === wanted || installed === `${wanted}:latest` || wanted === `${installed}:latest`;
}

/** Models a user may pick: local ones that are installed, and cloud ones whose last check succeeded. */
export async function listSelectableModels(): Promise<{ models: ModelOption[]; warning: string | null }> {
  const models: ModelOption[] = [];
  const rows = listProviders();
  const ollama = rows.find((provider) => provider.id === "ollama");
  let warning: string | null = null;

  if (!ollama || ollama.enabled) {
    const inventory = await getUserInventory();
    if (inventory.ok) {
      for (const model of inventory.models) {
        models.push({
          key: modelKey("ollama", model.name),
          providerId: "ollama",
          modelId: model.name,
          name: model.name,
          providerName: "Ollama",
          local: true,
          parameterSize: model.parameterSize,
          size: model.size,
        });
      }
    } else if (models.length === 0) {
      warning = inventory.error;
    }
  }

  for (const provider of rows) {
    if (provider.kind === "ollama" || !provider.enabled || !provider.apiKeyEnc || provider.healthOk !== true) {
      continue;
    }
    for (const model of listProviderModels(provider.id)) {
      if (!model.enabled || !model.available) continue;
      models.push({
        key: modelKey(provider.id, model.modelId),
        providerId: provider.id,
        modelId: model.modelId,
        name: model.modelId,
        providerName: provider.name,
        local: false,
        parameterSize: null,
        size: 0,
      });
    }
  }

  if (models.length === 0 && !warning) {
    warning = "No chat models are available. An admin can enable one under Providers.";
  }
  if (models.length > 0) warning = null;
  return { models, warning };
}

function findIn(models: ModelOption[], ref: ModelRef | null) {
  if (!ref) return undefined;
  return models.find(
    (model) =>
      model.providerId === ref.providerId &&
      (model.modelId === ref.modelId || (model.local && sameOllama(model.modelId, ref.modelId))),
  );
}

export function preferredModel(models: ModelOption[]) {
  const configured = findIn(models, getRouting().defaultModel);
  if (configured) return configured;
  const envDefault = models.find((model) => model.local && sameOllama(model.modelId, getModelName()));
  return envDefault ?? models[0] ?? null;
}

export type ChatTarget = { model: ModelOption; fallbackFrom: ModelOption | null };

/**
 * Picks the model for one turn. An explicit request for something that is not
 * actually available is rejected. A provider that just failed falls back once.
 */
export async function resolveChatTarget(input: {
  requestedProvider?: string;
  requestedModel?: string;
  conversationProvider: string | null;
  conversationModel: string | null;
  allowCloud: boolean;
}): Promise<{ ok: true; target: ChatTarget } | { ok: false; status: number; error: string }> {
  const { models, warning } = await listSelectableModels();
  if (models.length === 0) {
    return { ok: false, status: 503, error: warning ?? "No chat models are available." };
  }

  const usable = (model: ModelOption | undefined) =>
    model !== undefined && (model.local || input.allowCloud);

  let chosen: ModelOption | undefined;
  if (input.requestedModel) {
    const providerId = input.requestedProvider || "ollama";
    chosen = findIn(models, { providerId, modelId: input.requestedModel });
    if (!chosen && !input.requestedProvider) {
      const matches = models.filter((model) => model.modelId === input.requestedModel);
      chosen = matches.length === 1 ? matches[0] : undefined;
    }
    if (!chosen) {
      return { ok: false, status: 400, error: `Model "${input.requestedModel}" is not available. Pick another model.` };
    }
    if (!chosen.local && !input.allowCloud) {
      return {
        ok: false,
        status: 403,
        error: `Allow cloud models before using ${chosen.providerName}. Your messages, custom instructions and saved memories would be sent to them.`,
      };
    }
  } else {
    chosen =
      findIn(models, {
        providerId: input.conversationProvider ?? "ollama",
        modelId: input.conversationModel ?? "",
      }) ??
      preferredModel(models) ??
      models[0];
    if (chosen && !usable(chosen)) {
      chosen = models.find((model) => model.local) ?? chosen;
    }
  }

  if (!chosen) return { ok: false, status: 503, error: "No chat models are available." };

  if (providerIsDown(chosen.providerId)) {
    const fallback = findIn(models, getRouting().fallbackModel);
    if (fallback && fallback.key !== chosen.key && usable(fallback) && !providerIsDown(fallback.providerId)) {
      return { ok: true, target: { model: fallback, fallbackFrom: chosen } };
    }
  }
  if (!usable(chosen)) {
    return {
      ok: false,
      status: 403,
      error: `Allow cloud models before using ${chosen.providerName}. Your messages, custom instructions and saved memories would be sent to them.`,
    };
  }
  return { ok: true, target: { model: chosen, fallbackFrom: null } };
}

export function refOf(value: string | null | undefined): ModelRef | null {
  const parsed = parseModelRef(value);
  return parsed;
}
