// Customer-facing assistant names. Pure, so the client can name models that
// are no longer installed; admin overrides are applied server-side on top.

import { BRAND } from "@/lib/brand";
import type { ModelOption } from "@/lib/model-ref";

export type Tier = "Mini" | "Core" | "Pro" | "Ultra" | "Cloud";

const FAMILIES: [RegExp, string][] = [
  [/coder|codellama|codegemma|starcoder|devstral|codestral/, "Forge"],
  [/^deepseek-r1|^qwq|reason/, "Sage"],
  [/^llama/, "Atlas"],
  [/^gemma/, "Nova"],
  [/^qwen/, "Orion"],
  [/^(mistral|mixtral|ministral)/, "Lyra"],
  [/^phi/, "Pico"],
  [/^(gpt|o\d|chatgpt)/, "Helix"],
  [/^claude/, "Aria"],
  [/^gemini/, "Zenith"],
];

function billions(modelId: string, parameterSize: string | null) {
  const match = /([\d.]+)\s*([BM])\b/i.exec(parameterSize ?? "") ?? /:([\d.]+)([bm])\b/i.exec(modelId);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2]!.toUpperCase() === "M" ? value / 1000 : value;
}

export function tierOf(modelId: string, parameterSize: string | null, local: boolean): Tier {
  if (!local) return "Cloud";
  const size = billions(modelId, parameterSize);
  if (size === null) return "Core";
  if (size < 2) return "Mini";
  if (size < 8) return "Core";
  if (size < 30) return "Pro";
  return "Ultra";
}

function familyOf(modelId: string) {
  const id = modelId.toLowerCase().replace(/^.*\//, "");
  return FAMILIES.find(([pattern]) => pattern.test(id))?.[1] ?? "Echo";
}

/** The generated name, e.g. "xAI Forge Mini". Not guaranteed unique; see `uniqueNames`. */
export function defaultAssistantName(input: { modelId: string; parameterSize: string | null; local: boolean }) {
  const tier = tierOf(input.modelId, input.parameterSize, input.local);
  return `${BRAND.product} ${familyOf(input.modelId)}${tier === "Cloud" ? "" : ` ${tier}`}`;
}

const TIER_LINE: Record<Tier, string> = {
  Mini: "Fast and lightweight.",
  Core: "Balanced speed and quality.",
  Pro: "Higher quality for larger tasks.",
  Ultra: "Highest quality for demanding work.",
  Cloud: "Runs at an external provider.",
};

export function defaultAssistantDescription(input: {
  modelId: string;
  parameterSize: string | null;
  local: boolean;
  capabilityIds: string[];
}) {
  const tier = TIER_LINE[tierOf(input.modelId, input.parameterSize, input.local)];
  const has = (id: string) => input.capabilityIds.includes(id);
  const focus = has("coding")
    ? "Writes, explains and reviews code."
    : has("reasoning")
      ? "Works through problems step by step."
      : has("images")
        ? "Understands images as well as text."
        : "Everyday writing, questions and summaries.";
  return `${tier} ${focus}`;
}

/** The name to show for a stored reply, including ones from models that have since been removed. */
export function assistantLabel(
  models: Pick<ModelOption, "providerId" | "modelId" | "name">[],
  modelId: string,
  providerId?: string | null,
) {
  const provider = providerId || "ollama";
  const match =
    models.find((model) => model.providerId === provider && model.modelId === modelId) ??
    models.find((model) => model.modelId === modelId);
  return match?.name ?? defaultAssistantName({ modelId, parameterSize: null, local: provider === "ollama" });
}

/** Appends " 2", " 3"... to repeated names, in list order, so every assistant is distinguishable. */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} ${count}`;
  });
}
