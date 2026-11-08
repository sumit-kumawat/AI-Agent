import type { UIMessage } from "ai";

/** Per-message details sent with the stream and stored in `messages.meta`. */
export type ChatMessageMeta = {
  createdAt?: number;
  model?: string;
  /** The fact saved to memory by the user message this replies to. */
  memory?: string;
  feedback?: 1 | -1 | null;
};

export type ChatMessage = UIMessage<ChatMessageMeta>;

export function parseMeta(raw: string | null): ChatMessageMeta {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as ChatMessageMeta) : {};
  } catch {
    return {};
  }
}
