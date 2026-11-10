import type { ModelProfile } from "@/lib/models/capabilities";

export type ModelSkill = "code" | "reasoning" | "vision" | "tools";

export type ModelGroup = "General" | "Reasoning" | "Coding" | "External";

/** A model the user can pick. `key` is only an identifier; it is not a model name. */
export type ModelOption = {
  key: string;
  providerId: string;
  /** Internal model ID such as "llama3.2:1b"; shown to admins only. */
  modelId: string;
  /** Customer-facing assistant name (admin override or generated). */
  name: string;
  /** The generated name, shown to admins as the placeholder for overrides. */
  defaultName: string;
  /** One customer-facing sentence about what the assistant is good at. */
  description: string;
  providerName: string;
  /** Runs on this server (Ollama). Cloud models send the conversation to that provider. */
  local: boolean;
  parameterSize: string | null;
  size: number;
  /** Accepts images. */
  vision: boolean;
  /** Held in memory by Ollama right now, so the first token comes quickly. */
  loaded: boolean;
  skills: ModelSkill[];
  group: ModelGroup;
} & ModelProfile;

const SEP = "\u001f";

export function modelKey(providerId: string, modelId: string) {
  return `${providerId}${SEP}${modelId}`;
}

/** Accepts a key, or a legacy bare Ollama model name such as "llama3.2:1b". */
export function parseModelRef(value: string | null | undefined): { providerId: string; modelId: string } | null {
  if (!value || autoModeOf(value)) return null;
  const split = value.indexOf(SEP);
  if (split > 0) {
    return { providerId: value.slice(0, split), modelId: value.slice(split + 1) };
  }
  return { providerId: "ollama", modelId: value };
}

export const AUTO_MODES = ["intelligence", "balance", "cost"] as const;
export type AutoMode = (typeof AUTO_MODES)[number];

export const AUTO_INFO: Record<AutoMode, { label: string; description: string }> = {
  intelligence: { label: "Intelligence", description: "Favours reasoning and answer quality for complex tasks, even if slower" },
  balance: { label: "Balance", description: "Balances quality, speed and resource use" },
  cost: { label: "Cost", description: "Smallest local model that fits the task: fastest and lightest" },
};

export const DEFAULT_SELECTION = "auto:balance";

export function autoKey(mode: AutoMode) {
  return `auto:${mode}`;
}

export function autoModeOf(value: string | null | undefined): AutoMode | null {
  if (!value?.startsWith("auto:")) return null;
  const mode = value.slice(5);
  return (AUTO_MODES as readonly string[]).includes(mode) ? (mode as AutoMode) : null;
}
