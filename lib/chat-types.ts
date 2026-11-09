import type { UIMessage } from "ai";
import type { AttachmentInfo } from "@/lib/attachments/types";
import type { AutoMode } from "@/lib/model-ref";
import type { ResearchData } from "@/lib/research/types";

/** Per-message details sent with the stream and stored in `messages.meta`. */
export type ChatMessageMeta = {
  createdAt?: number;
  model?: string;
  provider?: string;
  /** Set when a failing provider was replaced by the configured fallback. */
  fallbackFrom?: string;
  /** Set when Auto chose the model for this reply. */
  auto?: { mode: AutoMode; reason: string };
  /** The fact saved to memory by the user message this replies to. */
  memory?: string;
  feedback?: 1 | -1 | null;
  /** Files sent with a user message. */
  attachments?: AttachmentInfo[];
  /** How much of the attached files the reply could read, when not all of it. */
  fileNotes?: string[];
  /** Set on Deep Research replies: the plan, progress and sources. */
  research?: ResearchData;
};

export type ChatDataParts = { research: ResearchData };

export type ChatMessage = UIMessage<ChatMessageMeta, ChatDataParts>;

export function parseMeta(raw: string | null): ChatMessageMeta {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as ChatMessageMeta) : {};
  } catch {
    return {};
  }
}
