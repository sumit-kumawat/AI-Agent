import { modelKey, parseModelRef, type AutoMode, type ModelOption } from "@/lib/model-ref";
import { chooseAuto, skillsFor, type TaskProfile } from "@/lib/models/router";
import { describeModel, type ContextWindow } from "@/lib/models/capabilities";
import { getModelName, getUserInventory, modelInfo, runningModels, serverDefaultContext, type ModelInfo } from "@/lib/ollama";
import { getProvider, getRouting, listProviderModels, listProviders, type ModelRef } from "@/lib/providers/store";
import { linkReadingEnabled } from "@/lib/research/config";
import { applyBranding } from "@/lib/models/branding-store";

const downUntil = new Map<string, number>();

/** Remembers a failed call so the next message can use the fallback without waiting. */
export function noteProviderFailure(providerId: string) {
  downUntil.set(providerId, Date.now() + 2 * 60 * 1000);
}

export function providerIsDown(providerId: string) {
  if ((downUntil.get(providerId) ?? 0) > Date.now()) return true;
  return getProvider(providerId)?.healthOk === false;
}

/** Cloud APIs do not report image support, so this follows the model families known to accept images. */
function cloudVision(modelId: string) {
  const id = modelId.toLowerCase();
  if (/embed|whisper|tts|dall-e|audio|instruct-|o1-mini|o3-mini|gpt-3\.5/.test(id)) return false;
  return /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|^o[134]\b|claude-(3|sonnet|opus|haiku)|gemini|pixtral|vision|llava|grok-(2-vision|4)|qwen.*vl|llama-4/.test(
    id,
  );
}

/**
 * The window a conversation really gets. A loaded model reports its own; an
 * unloaded one will get its Modelfile num_ctx or the server default, never
 * more than the model maximum.
 */
function contextWindow(info: ModelInfo, running: number | undefined, serverDefault: number | null): ContextWindow {
  const cap = (tokens: number) => (info.maxContext ? Math.min(tokens, info.maxContext) : tokens);
  if (running) return { tokens: running, max: info.maxContext, source: "running" };
  if (info.numCtx) return { tokens: cap(info.numCtx), max: info.maxContext, source: "model" };
  if (serverDefault) return { tokens: cap(serverDefault), max: info.maxContext, source: "server" };
  return { tokens: null, max: info.maxContext, source: info.maxContext ? "maximum" : null };
}

function sameOllama(installed: string, wanted: string) {
  return installed === wanted || installed === `${wanted}:latest` || wanted === `${installed}:latest`;
}

/** Models a user may pick: local ones that are installed, and cloud ones whose last check succeeded. */
export async function listSelectableModels(): Promise<{ models: ModelOption[]; warning: string | null }> {
  const models: Parameters<typeof applyBranding>[0] = [];
  const rows = listProviders();
  const ollama = rows.find((provider) => provider.id === "ollama");
  let warning: string | null = null;
  const webLinks = linkReadingEnabled();

  if (!ollama || ollama.enabled) {
    const inventory = await getUserInventory();
    if (inventory.ok) {
      const [infos, running, serverDefault] = await Promise.all([
        Promise.all(inventory.models.map((model) => modelInfo(model.name))),
        runningModels(),
        serverDefaultContext(),
      ]);
      for (const [index, model] of inventory.models.entries()) {
        const info = infos[index]!;
        const vision = info.capabilities.includes("vision");
        const context = contextWindow(info, running.get(model.name), serverDefault);
        models.push({
          ...skillsFor(model.name, info.capabilities, vision),
          ...describeModel({ name: model.name, local: true, capabilities: info.capabilities, vision, parameterSize: model.parameterSize, context, webLinks }),
          loaded: running.has(model.name),
          key: modelKey("ollama", model.name),
          providerId: "ollama",
          modelId: model.name,
          providerName: "Ollama",
          local: true,
          parameterSize: model.parameterSize,
          size: model.size,
          vision,
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
      const vision = cloudVision(model.modelId);
      models.push({
        ...skillsFor(model.modelId, [], vision),
        ...describeModel({
          name: model.modelId,
          local: false,
          capabilities: [],
          vision,
          parameterSize: null,
          context: { tokens: null, max: null, source: null },
          webLinks,
        }),
        group: "External",
        loaded: true,
        key: modelKey(provider.id, model.modelId),
        providerId: provider.id,
        modelId: model.modelId,
        providerName: provider.name,
        local: false,
        parameterSize: null,
        size: 0,
        vision,
      });
    }
  }

  if (models.length === 0 && !warning) {
    warning = "No chat models are available. An admin can enable one under Providers.";
  }
  if (models.length > 0) warning = null;
  return { models: applyBranding(models), warning };
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

export type ChatTarget = {
  model: ModelOption;
  fallbackFrom: ModelOption | null;
  /** Set when Auto chose the model. */
  auto: { mode: AutoMode; reason: string } | null;
};

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
  /** Auto selection: the mode and what this turn needs. Ignored when a model is requested. */
  mode?: AutoMode;
  task?: TaskProfile;
  /** The models this user's plan allows; defaults to every selectable model. */
  catalog?: { models: ModelOption[]; warning: string | null };
}): Promise<{ ok: true; target: ChatTarget } | { ok: false; status: number; error: string }> {
  const { models, warning } = input.catalog ?? (await listSelectableModels());
  if (models.length === 0) {
    return { ok: false, status: 503, error: warning ?? "No chat models are available." };
  }

  const usable = (model: ModelOption | undefined) =>
    model !== undefined && (model.local || input.allowCloud);

  if (input.mode && input.task && !input.requestedModel) {
    const previous = findIn(models, {
      providerId: input.conversationProvider ?? "ollama",
      modelId: input.conversationModel ?? "",
    });
    const auto = chooseAuto(models, input.mode, input.task, {
      allowCloud: input.allowCloud,
      previous: previous?.key ?? null,
      unavailable: (model) => providerIsDown(model.providerId),
    });
    if ("error" in auto) return { ok: false, status: 503, error: auto.error };
    return { ok: true, target: { model: auto.model, fallbackFrom: null, auto: { mode: input.mode, reason: auto.reason } } };
  }

  let chosen: ModelOption | undefined;
  if (input.requestedModel) {
    const providerId = input.requestedProvider || "ollama";
    chosen = findIn(models, { providerId, modelId: input.requestedModel });
    if (!chosen && !input.requestedProvider) {
      const matches = models.filter((model) => model.modelId === input.requestedModel);
      chosen = matches.length === 1 ? matches[0] : undefined;
    }
    if (!chosen) {
      return { ok: false, status: 400, error: "That assistant is not available right now. Pick another one." };
    }
    if (!chosen.local && !input.allowCloud) {
      return {
        ok: false,
        status: 403,
        error: `Allow external assistants before using ${chosen.name}. Your messages, custom instructions and saved memories would be sent to ${chosen.providerName}.`,
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
      return { ok: true, target: { model: fallback, fallbackFrom: chosen, auto: null } };
    }
  }
  if (!usable(chosen)) {
    return {
      ok: false,
      status: 403,
      error: `Allow external assistants before using ${chosen.name}. Your messages, custom instructions and saved memories would be sent to ${chosen.providerName}.`,
    };
  }
  return { ok: true, target: { model: chosen, fallbackFrom: null, auto: null } };
}

export function refOf(value: string | null | undefined): ModelRef | null {
  const parsed = parseModelRef(value);
  return parsed;
}
