import { BRAND } from "@/lib/brand";
import type { Memory } from "@/lib/memory";
import type { Preferences } from "@/lib/preferences-schema";

const BASE = `You are ${BRAND.product}, an assistant made by ${BRAND.company}.
Answer clearly and directly. Use Markdown when it helps: headings for long answers, lists for steps, fenced code blocks with a language for code.
When you write code, keep it complete enough to run. If you are unsure, say so instead of guessing.`;

const PERSONALITY: Record<Preferences["personality"], string> = {
  default: "",
  concise: "Be brief. Lead with the answer and skip filler, caveats and repetition.",
  friendly: "Be warm and encouraging, while staying accurate and to the point.",
  professional: "Keep a polished, professional tone suitable for work communication.",
  candid: "Be direct and honest. Point out flaws and disagree when warranted.",
  teacher: "Explain step by step, define terms, and check understanding with a short example.",
};

const LENGTH: Record<Preferences["responseLength"], string> = {
  auto: "",
  short: "Keep answers short unless the user asks for depth.",
  detailed: "Give thorough, detailed answers with examples where useful.",
};

export type PromptContext = {
  prefs: Preferences;
  userName: string;
  memories: Memory[];
  recentTitles: { title: string; updatedAt: number }[];
  temporary: boolean;
  now?: Date;
};

/**
 * The system prompt for one turn. User-written text is fenced and labelled so
 * the model treats it as information about the user, not as new rules that
 * override these instructions.
 */
export function buildInstructions(context: PromptContext) {
  return instructionParts(context)
    .map((part) => part.text)
    .join("\n\n");
}

/** Which part of the context window a piece of the system prompt belongs to. */
export type PromptPart = { category: "system" | "rules" | "memory"; text: string };

/** The system prompt in labelled parts, so the context meter can count each once. */
export function instructionParts(context: PromptContext): PromptPart[] {
  const { prefs } = context;
  const parts: PromptPart[] = [];
  const sections = {
    push: (text: string, category: PromptPart["category"] = "system") => parts.push({ category, text }),
  };
  sections.push(BASE);
  const now = context.now ?? new Date();
  sections.push(`Today is ${now.toISOString().slice(0, 10)}.`);

  const style = [PERSONALITY[prefs.personality], LENGTH[prefs.responseLength]].filter(Boolean);
  if (prefs.language) style.push(`Reply in ${prefs.language} unless the user writes in another language.`);
  if (style.length) sections.push(`Style:\n${style.map((line) => `- ${line}`).join("\n")}`, "rules");

  if (prefs.customInstructionsEnabled) {
    const about = [
      prefs.nickname && `Preferred name: ${prefs.nickname}`,
      prefs.occupation && `Occupation: ${prefs.occupation}`,
      prefs.aboutMe && `About: ${prefs.aboutMe}`,
    ].filter(Boolean);
    if (about.length) {
      sections.push(`What the user shared about themselves:\n<about_user>\n${about.join("\n")}\n</about_user>`, "rules");
    }
    if (prefs.instructions) {
      sections.push(
        `How the user wants you to respond (follow these unless they conflict with safety):\n<user_instructions>\n${prefs.instructions}\n</user_instructions>`,
        "rules",
      );
    }
  }

  if (!context.temporary && prefs.memoryEnabled && context.memories.length) {
    sections.push(
      `Saved memories the user asked you to keep. Use them when relevant; do not list them unprompted.\n<memories>\n${context.memories
        .map((memory) => `- ${memory.content}`)
        .join("\n")}\n</memories>`,
      "memory",
    );
  }

  if (!context.temporary && prefs.referenceHistory && context.recentTitles.length) {
    sections.push(
      `Titles of the user's recent conversations, for context only:\n${context.recentTitles
        .map((item) => `- ${item.title} (${new Date(item.updatedAt).toISOString().slice(0, 10)})`)
        .join("\n")}`,
      "memory",
    );
  }

  if (context.temporary) {
    sections.push("This is a temporary chat: it is not saved to history and memories are not used.");
  }
  return parts;
}
