"use client";

import {
  Brain,
  Check,
  Copy,
  Download,
  FastForward,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { MessageAttachments } from "@/components/chat/attachments";
import { exportReport, linkCitations, ResearchPanel } from "@/components/chat/research";
import { useChatChrome } from "@/components/chat/chat-shell";
import { Markdown } from "@/components/chat/markdown";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import type { AttachmentInfo } from "@/lib/attachments/types";
import type { ResearchData } from "@/lib/research/types";

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Plain-HTTP LAN addresses have no Clipboard API.
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

const noop = () => () => undefined;

/** Local time, rendered only in the browser so server and client markup match. */
function Timestamp({ at }: { at?: number }) {
  const label = useSyncExternalStore(
    noop,
    () => {
      if (!at) return null;
      const date = new Date(at);
      const sameDay = date.toDateString() === new Date().toDateString();
      return sameDay
        ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    },
    () => null,
  );
  if (!label || !at) return null;
  return (
    <time dateTime={new Date(at).toISOString()} className="px-1 text-xs text-muted-foreground">
      {label}
    </time>
  );
}

function IconAction({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={pressed ? "text-foreground" : "text-muted-foreground"}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <IconAction
      label={copied ? "Copied" : "Copy"}
      onClick={() => {
        void copyText(text).then(() => setCopied(true)).catch(() => undefined);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </IconAction>
  );
}

const hoverReveal = "opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100";

export function UserMessage({
  text,
  createdAt,
  attachments = [],
  onEdit,
}: {
  text: string;
  createdAt?: number;
  attachments?: AttachmentInfo[];
  /** Replaces this message and everything after it. Absent while a reply streams. */
  onEdit?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 320)}px`;
  }, [draft, editing]);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  if (editing && onEdit) {
    const changed = draft.trim() && draft.trim() !== text.trim();
    return (
      <form
        className="ml-auto w-full max-w-[85%] rounded-3xl bg-muted p-3 sm:max-w-[75%]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!changed) return;
          setEditing(false);
          onEdit(draft.trim());
        }}
      >
        <textarea
          ref={field}
          value={draft}
          aria-label="Edit message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
          }}
          className="block w-full resize-none bg-transparent px-1 text-[15px] leading-7 outline-none"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!changed}>
            Send
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex flex-col items-end gap-1" data-role="user">
      <MessageAttachments files={attachments} />
      {text ? (
        <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 text-[15px] leading-7 break-words whitespace-pre-wrap sm:max-w-[75%]">
          {text}
        </div>
      ) : null}
      <div className={`flex items-center ${hoverReveal}`}>
        <Timestamp at={createdAt} />
        {text ? <CopyButton text={text} /> : null}
        {onEdit && text ? (
          <IconAction
            label="Edit message"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            <Pencil />
          </IconAction>
        ) : null}
      </div>
    </div>
  );
}

function FeedbackButtons({ messageId, initial }: { messageId: string; initial: 1 | -1 | null }) {
  const [value, setValue] = useState(initial);
  const { notify, toast } = useFeedback();

  async function rate(next: 1 | -1) {
    const target = value === next ? null : next;
    const previous = value;
    setValue(target);
    const response = await fetch(`/api/messages/${messageId}/feedback`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: target }),
    }).catch(() => null);
    if (!response?.ok) {
      setValue(previous);
      void notify({ tone: "error", title: "Feedback not saved", description: "Try again in a moment." });
    } else if (target !== null) {
      toast("Thanks for the feedback");
    }
  }

  return (
    <>
      <IconAction label="Good response" pressed={value === 1} onClick={() => void rate(1)}>
        <ThumbsUp className={value === 1 ? "fill-current" : undefined} />
      </IconAction>
      <IconAction label="Bad response" pressed={value === -1} onClick={() => void rate(-1)}>
        <ThumbsDown className={value === -1 ? "fill-current" : undefined} />
      </IconAction>
    </>
  );
}

export function AssistantMessage({
  id,
  text,
  streaming,
  last,
  createdAt,
  model,
  autoReason,
  memory,
  note,
  feedback = null,
  persisted = false,
  onRegenerate,
  onContinue,
  research,
  question,
}: {
  id?: string;
  text: string;
  research?: ResearchData;
  /** The request a research report answers; used as the export title. */
  question?: string;
  streaming: boolean;
  last: boolean;
  createdAt?: number;
  model?: string;
  /** Why Auto chose `model`; absent when the user picked it. */
  autoReason?: string;
  memory?: string;
  note?: string;
  feedback?: 1 | -1 | null;
  /** The reply is saved, so it can be rated. */
  persisted?: boolean;
  onRegenerate?: () => void;
  onContinue?: () => void;
}) {
  const { openSettings } = useChatChrome();
  return (
    <div className="group flex flex-col gap-1" data-role="assistant">
      {note ? <p className="mb-1 text-xs text-muted-foreground">{note}</p> : null}
      {memory ? (
        <button
          type="button"
          data-memory-chip
          onClick={() => openSettings("memory")}
          className="mb-1 flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          title={memory}
        >
          <Brain className="size-3.5" />
          Memory updated
        </button>
      ) : null}
      {research ? <ResearchPanel data={research} /> : null}
      {text ? (
        <Markdown text={research ? linkCitations(text, research) : text} streaming={streaming} />
      ) : streaming ? (
        <span className="harbor-caret text-[15px] leading-7" aria-label="Generating">▋</span>
      ) : null}
      {!streaming && text ? (
        <div className={`-ml-2 flex flex-wrap items-center gap-0.5 ${last ? "opacity-100" : hoverReveal}`}>
          <CopyButton text={text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "")} />
          {persisted && id ? <FeedbackButtons key={id} messageId={id} initial={feedback} /> : null}
          {last && onRegenerate ? (
            <IconAction label="Regenerate" onClick={onRegenerate}>
              <RefreshCw />
            </IconAction>
          ) : null}
          {research && research.status !== "running" ? (
            <IconAction label="Export report as Markdown" onClick={() => exportReport(text, research, question)}>
              <Download />
            </IconAction>
          ) : null}
          {last && onContinue ? (
            <IconAction label="Continue generating" onClick={onContinue}>
              <FastForward />
            </IconAction>
          ) : null}
          <span className="ml-1 text-xs text-muted-foreground">
            {model ? (
              <span className="hidden sm:inline" title={autoReason} data-auto-reason={autoReason}>
                {autoReason ? `Auto · ${model}` : model}
              </span>
            ) : null}
          </span>
          <Timestamp at={createdAt} />
        </div>
      ) : null}
    </div>
  );
}
