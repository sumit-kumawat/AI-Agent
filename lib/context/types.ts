// Client-safe description of what fills a model's context window for one turn.

export const CONTEXT_CATEGORIES = [
  "system",
  "rules",
  "memory",
  "summary",
  "history",
  "attachments",
  "web",
  "current",
] as const;
export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];

export const CATEGORY_INFO: Record<ContextCategory, { label: string; description: string; color: string }> = {
  system: { label: "System prompt", description: "The assistant's base instructions and today's date", color: "#64748b" },
  rules: { label: "Your rules", description: "Style settings, custom instructions and what you shared about yourself", color: "#8b5cf6" },
  memory: { label: "Memory", description: "Saved memories and recent chat titles used for this turn", color: "#ec4899" },
  summary: { label: "Summary", description: "A summary standing in for older messages", color: "#f59e0b" },
  history: { label: "Conversation", description: "Earlier messages sent in full", color: "#3b82f6" },
  attachments: { label: "Attachments", description: "Text read from attached files, and images", color: "#10b981" },
  web: { label: "Web pages", description: "Pages fetched from links in your message", color: "#06b6d4" },
  current: { label: "Your message", description: "The message being answered", color: "#0f766e" },
};

export type ContextSnapshot = {
  /** Tokens per category, estimated from text length (about 4 characters a token). */
  categories: Partial<Record<ContextCategory, number>>;
  estimatedTotal: number;
  /** Space kept free for the reply. */
  reservedForReply: number;
  window: { tokens: number | null; source: "running" | "model" | "server" | "maximum" | "assumed" | null; max: number | null };
  /** Older messages represented by the summary instead of in full. */
  summarized: number;
  /** Older messages that will be summarised on the next send. */
  pendingSummary: number;
  /** Prompt and reply tokens the model reported after replying; exact. */
  reported?: { input: number; output: number };
};
