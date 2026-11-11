import type { UIMessage } from "ai";
import type { AttachmentInfo } from "@/lib/attachments/types";
import type { ContextSnapshot } from "@/lib/context/types";
import type { AutoMode } from "@/lib/model-ref";
import type { ResearchData } from "@/lib/research/types";
import type { SearchSource, WebSource } from "@/lib/web/types";

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
  /** Links from the user's message that the server opened for this reply. */
  web?: WebSource[];
  /** Search mode sources with citation status. */
  searchSources?: SearchSource[];
  /** Set when Search was on but could not run. */
  searchNotice?: string;
  /** Set when the message had links but link reading is turned off. */
  webNotice?: string;
  /** Reasoning text when DeepThink / a thinking model produced it. */
  thinking?: string;
  /** Milliseconds spent producing `thinking`, when known. */
  thinkingMs?: number;
  /** What filled the context window for this reply. */
  context?: ContextSnapshot;
};

export type ChatDataParts = {
  research: ResearchData;
  /** Emitted before answer tokens when Search mode gathers sources. */
  sources: SearchSource[];
};

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
