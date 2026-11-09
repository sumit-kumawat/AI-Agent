import { generateText, type LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import type { ContextCategory, ContextSnapshot } from "@/lib/context/types";
import type { ModelOption } from "@/lib/model-ref";

/** About four characters per token for English text and code. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

/** Without a reported window, assume this much: small enough for any current chat model. */
const ASSUMED_WINDOW = 8_192;
const MAX_REPLY = 4_096;
/** Ollama documents images at a few hundred tokens each; counted at this. */
export const IMAGE_TOKENS = 600;

export function windowOf(model: ModelOption): ContextSnapshot["window"] {
  if (model.context.tokens) return { tokens: model.context.tokens, source: model.context.source, max: model.context.max };
  return { tokens: ASSUMED_WINDOW, source: "assumed", max: model.context.max };
}

export function replyReserve(window: number) {
  return Math.min(MAX_REPLY, Math.floor(window / 4));
}

type Message = { id: string; role: "user" | "assistant"; content: string; extraTokens?: number };

export type HistoryPlan = {
  /** Index of the first message sent in full. */
  keepFrom: number;
  /** A stored summary that covers exactly messages [0, keepFrom). */
  summary: string | null;
  /** Messages before keepFrom that still need summarising. */
  pending: number;
};

function cost(message: Message) {
  return estimateTokens(message.content) + (message.extraTokens ?? 0) + 4;
}

function storedSummary(conversationId: string) {
  const row = db
    .select({ summary: conversations.summary, count: conversations.summaryCount, through: conversations.summaryThrough })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  return row?.summary && row.count && row.through ? { text: row.summary, count: row.count, through: row.through } : null;
}

/**
 * Decides which messages go in full. The newest always fit; older ones move
 * into a summary once the full history would crowd out the reply. A stored
 * summary is reused only if the messages it covers are unchanged, so nothing
 * is ever sent twice (once summarised and once in full).
 */
export function planHistory(input: { conversationId: string | null; messages: Message[]; budget: number }): HistoryPlan {
  const { messages, budget } = input;
  const total = messages.reduce((sum, message) => sum + cost(message), 0);
  const stored = input.conversationId ? storedSummary(input.conversationId) : null;
  const valid = stored && messages[stored.count - 1]?.id === stored.through && stored.count < messages.length ? stored : null;

  if (total <= budget) return { keepFrom: 0, summary: null, pending: 0 };

  // Keep the newest messages within 70% of the budget, leaving room for the summary.
  let keepFrom = messages.length - 1;
  let used = cost(messages[keepFrom]!);
  while (keepFrom > 0 && used + cost(messages[keepFrom - 1]!) <= budget * 0.7) {
    keepFrom -= 1;
    used += cost(messages[keepFrom]!);
  }
  // Start the kept part on a user message so the model sees a clean turn.
  while (keepFrom < messages.length - 1 && messages[keepFrom]!.role !== "user") keepFrom += 1;

  if (valid && valid.count === keepFrom) return { keepFrom, summary: valid.text, pending: 0 };
  if (valid && valid.count > keepFrom) {
    // The summary already covers more than needed; keep fewer messages in full instead of overlapping.
    return { keepFrom: valid.count, summary: valid.text, pending: 0 };
  }
  return { keepFrom, summary: valid?.text ?? null, pending: keepFrom - (valid?.count ?? 0) };
}

const SUMMARY_INSTRUCTIONS = `You compress a conversation so it can continue in a smaller context window.
Write a faithful summary of the conversation below for your own later reference.
Keep: the user's goals and questions, decisions and answers given, names, numbers, dates, file names, code identifiers and short code that matters, and anything still open.
Do not add facts, opinions or advice that are not in the conversation. Write plain text, at most 300 words.`;

/** Summarises messages [from, keepFrom) on top of the previous summary and stores the result. */
export async function summarize(input: {
  conversationId: string | null;
  model: LanguageModel;
  messages: Message[];
  plan: HistoryPlan;
  /** Tokens the summarising call may send; the oldest messages are dropped past it. */
  budget: number;
  signal?: AbortSignal;
}): Promise<{ summary: string; usage: { input: number; output: number; estimated: boolean } }> {
  const start = input.plan.keepFrom - input.plan.pending;
  let room = Math.max(2_000, (input.budget - estimateTokens(input.plan.summary ?? "")) * 4);
  const lines: string[] = [];
  for (const message of input.messages.slice(start, input.plan.keepFrom).reverse()) {
    const content = message.content.length > 6_000 ? `${message.content.slice(0, 6_000)} […]` : message.content;
    const line = `${message.role === "user" ? "User" : "Assistant"}: ${content}`;
    if (line.length > room) {
      lines.push("(Earlier messages omitted.)");
      break;
    }
    lines.push(line);
    room -= line.length + 2;
  }
  const transcript = lines.reverse().join("\n\n");
  const prompt = input.plan.summary
    ? `Summary of the conversation before this point:\n${input.plan.summary}\n\nWhat came after:\n${transcript}`
    : transcript;
  const result = await generateText({
    model: input.model,
    instructions: SUMMARY_INSTRUCTIONS,
    prompt,
    maxOutputTokens: 600,
    abortSignal: input.signal,
  });
  const summary = result.text.trim();
  if (input.conversationId && summary) {
    db.update(conversations)
      .set({ summary, summaryCount: input.plan.keepFrom, summaryThrough: input.messages[input.plan.keepFrom - 1]!.id })
      .where(eq(conversations.id, input.conversationId))
      .run();
  }
  const inputTokens = result.usage.inputTokens;
  const outputTokens = result.usage.outputTokens;
  return {
    summary,
    usage: {
      input: inputTokens ?? estimateTokens(SUMMARY_INSTRUCTIONS + prompt),
      output: outputTokens ?? estimateTokens(summary),
      estimated: inputTokens === undefined || outputTokens === undefined,
    },
  };
}

export function summaryBlock(summary: string) {
  return `Summary of the earlier part of this conversation (older messages are not repeated below):\n<conversation_summary>\n${summary}\n</conversation_summary>`;
}

/** Adds up one turn's context by category. Each piece of text is counted exactly once. */
export function snapshot(input: {
  parts: { category: ContextCategory; text: string }[];
  history: Message[];
  current: Message | null;
  images: number;
  window: ContextSnapshot["window"];
  summarized: number;
  pendingSummary: number;
}): ContextSnapshot {
  const categories: Partial<Record<ContextCategory, number>> = {};
  const add = (category: ContextCategory, tokens: number) => {
    if (tokens > 0) categories[category] = (categories[category] ?? 0) + tokens;
  };
  for (const part of input.parts) add(part.category, estimateTokens(part.text));
  for (const message of input.history) add("history", cost(message) - (message.extraTokens ?? 0));
  if (input.current) add("current", cost(input.current) - (input.current.extraTokens ?? 0));
  add("attachments", input.images * IMAGE_TOKENS);
  const estimatedTotal = Object.values(categories).reduce((sum, value) => sum + (value ?? 0), 0);
  return {
    categories,
    estimatedTotal,
    reservedForReply: replyReserve(input.window.tokens ?? ASSUMED_WINDOW),
    window: input.window,
    summarized: input.summarized,
    pendingSummary: input.pendingSummary,
  };
}
