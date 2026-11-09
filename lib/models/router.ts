import { AUTO_INFO, type AutoMode, type ModelGroup, type ModelOption, type ModelSkill } from "@/lib/model-ref";

/** What Ollama reports plus what the model name says about its training. */
export function skillsFor(name: string, capabilities: string[], vision: boolean): { skills: ModelSkill[]; group: ModelGroup } {
  const id = name.toLowerCase();
  const skills: ModelSkill[] = [];
  const code = /coder|codellama|starcoder|codestral|devstral|codegemma|deepseek-coder/.test(id);
  const reasoning = capabilities.includes("thinking") || /deepseek-r1|qwq|reason|magistral/.test(id);
  if (code) skills.push("code");
  if (reasoning) skills.push("reasoning");
  if (vision) skills.push("vision");
  if (capabilities.includes("tools")) skills.push("tools");
  return { skills, group: code ? "Coding" : reasoning ? "Reasoning" : "General" };
}

export type TaskKind = "code" | "reasoning" | "chat";

export type TaskProfile = {
  kind: TaskKind;
  images: boolean;
  documents: boolean;
  /** 0 for a quick question, 1 for long, multi-part or analytical work. */
  complexity: number;
};

const CODE_HINTS =
  /```|`[^`\n]+\(|\b(function|class|def|import|export|const|let|var|return|async|await|interface|struct|impl|fn|public static|#include|SELECT|INSERT|UPDATE|CREATE TABLE)\b|\b(code|bug|debug|stack ?trace|compile|refactor|regex|typescript|javascript|python|java|golang|rust|c\+\+|sql|bash|script|api|json|yaml|dockerfile|npm|pip)\b|\.(ts|tsx|js|py|go|rs|java|rb|php|cs|cpp|sh)\b/i;
const REASONING_HINTS =
  /\b(prove|proof|derive|calculate|solve|equation|step[- ]by[- ]step|why does|why is|reason|logic|puzzle|probability|integral|derivative|optimi[sz]e|trade-?offs?|compare|analy[sz]e|evaluate|plan|strategy|pros and cons)\b|[0-9]\s*[-+*/^=]\s*[0-9]/i;
const DEPTH_HINTS = /\b(detailed|in depth|thorough|comprehensive|explain|architecture|design|essay|report|review)\b/i;

/** Classifies one turn from the latest message, its files and how long the conversation is. */
export function analyzeTask(input: { text: string; images: boolean; documents: boolean; historyChars: number }): TaskProfile {
  const text = input.text;
  const kind: TaskKind = CODE_HINTS.test(text) ? "code" : REASONING_HINTS.test(text) ? "reasoning" : "chat";
  let complexity = Math.min(text.length / 1500, 0.5);
  if (kind !== "chat") complexity += 0.25;
  if (DEPTH_HINTS.test(text)) complexity += 0.2;
  if ((text.match(/\?/g) ?? []).length > 1) complexity += 0.1;
  if (input.documents) complexity += 0.2;
  if (input.historyChars > 8000) complexity += 0.1;
  return { kind, images: input.images, documents: input.documents, complexity: Math.min(1, complexity) };
}

function billions(model: ModelOption) {
  const match = model.parameterSize?.trim().match(/^([\d.]+)\s*([KMBT])?$/i);
  if (match) {
    const scale = { K: 1e-6, M: 1e-3, B: 1, T: 1e3 }[(match[2] ?? "B").toUpperCase() as "K" | "M" | "B" | "T"];
    return Number(match[1]) * (scale ?? 1);
  }
  return model.local ? model.size / 6e8 : 30;
}

/** Rough answer quality for this task: grows with model size, adjusted for what the model was trained for. */
function quality(model: ModelOption, task: TaskProfile) {
  let score = Math.log2(1 + billions(model));
  const has = (skill: ModelSkill) => model.skills.includes(skill);
  if (task.kind === "code") score *= has("code") ? 1.5 : 0.9;
  else if (has("code")) score *= 0.8;
  if (task.kind === "reasoning" && has("reasoning")) score *= 1.3;
  if (task.kind === "chat" && has("reasoning")) score *= 0.85;
  return score;
}

/** Memory and time to run it, in gigabytes of weights. Loaded models skip the load. */
function cost(model: ModelOption) {
  if (!model.local) return 6;
  const gb = model.size / 1e9;
  return model.loaded ? gb * 0.85 : gb;
}

function score(model: ModelOption, task: TaskProfile, mode: AutoMode, previous: string | null) {
  const q = quality(model, task);
  const c = cost(model);
  const sticky = previous === model.key ? 0.2 : 0;
  switch (mode) {
    case "intelligence":
      return q - 0.02 * c + sticky / 4;
    case "cost":
      return 0.4 * q - c + sticky / 2;
    case "balance":
      return q * (0.6 + 0.6 * task.complexity) - 0.35 * c + sticky;
  }
}

const KIND_LABEL: Record<TaskKind, string> = { code: "Coding", reasoning: "Reasoning", chat: "General" };

export type AutoChoice = { model: ModelOption; reason: string; task: TaskProfile };

/**
 * Picks a model for one turn. Only models that are actually installed (or cloud
 * models that passed their health check) are passed in. Cloud models are only
 * considered in Intelligence mode, and only when the user allowed them.
 */
export function chooseAuto(
  models: ModelOption[],
  mode: AutoMode,
  task: TaskProfile,
  options: { allowCloud: boolean; previous: string | null; unavailable: (model: ModelOption) => boolean },
): AutoChoice | { error: string } {
  let pool = models.filter((model) => !options.unavailable(model) && (model.local || (options.allowCloud && mode === "intelligence")));
  if (pool.length === 0) pool = models.filter((model) => model.local && !options.unavailable(model));
  if (task.images) {
    pool = pool.filter((model) => model.vision);
    if (pool.length === 0) {
      return { error: "None of the available models can read images. Remove the image, or ask an admin to install a vision model." };
    }
  }
  if (pool.length === 0) return { error: "No chat models are available right now." };

  const ranked = pool
    .map((model) => ({ model, value: score(model, task, mode, options.previous) }))
    .sort((a, b) => b.value - a.value);
  const model = ranked[0]!.model;
  const parts = [`${AUTO_INFO[mode].label} mode`, `${KIND_LABEL[task.kind].toLowerCase()} task`];
  if (task.images) parts.push("needs image reading");
  if (task.documents) parts.push("uses attached files");
  if (task.complexity >= 0.6) parts.push("complex");
  else if (task.complexity < 0.2) parts.push("quick");
  return { model, task, reason: `Auto picked ${model.name}: ${parts.join(", ")}.` };
}
