"use client";

import { code } from "@streamdown/code";
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useState } from "react";
import { Streamdown } from "streamdown";

const plugins = { code };
const controls = { code: { copy: true, download: false }, table: { copy: true, download: false, fullscreen: false }, mermaid: false };
const linkSafety = { enabled: false };

/** Splits older models' inline <think> blocks from the final answer. */
export function splitThinking(text: string) {
  const match = text.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/);
  if (!match) return { thinking: null, answer: text, thinkingDone: true };
  return {
    thinking: match[1]?.trim() ?? "",
    answer: text.slice(match[0].length),
    thinkingDone: match[2] === "</think>",
  };
}

function formatThoughtDuration(ms: number | undefined) {
  if (ms === undefined || ms < 0) return null;
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${seconds}s`;
}

export function ThinkingBlock({
  text,
  streaming,
  done,
  durationMs,
}: {
  text: string;
  streaming?: boolean;
  done?: boolean;
  durationMs?: number;
}) {
  const finished = done ?? !streaming;
  // null = follow auto behaviour (open while streaming); boolean = user override
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !finished;
  const label = finished ? formatThoughtDuration(durationMs) ?? "Show reasoning" : "Thinking…";
  return (
    <div className="mb-3 text-xs text-muted-foreground" data-thinking={finished ? "done" : "streaming"}>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md py-0.5 hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOverride(!open)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span>{label}</span>
      </button>
      {open ? <p className="mt-2 whitespace-pre-wrap rounded-lg border px-3 py-2">{text}</p> : null}
    </div>
  );
}

function MarkdownImpl({
  text,
  streaming = false,
  thinking: thinkingProp,
  thinkingDone,
  thinkingMs,
}: {
  text: string;
  streaming?: boolean;
  /** Reasoning from a separate stream/part or saved meta. */
  thinking?: string | null;
  thinkingDone?: boolean;
  thinkingMs?: number;
}) {
  const split = thinkingProp == null || thinkingProp === "" ? splitThinking(text) : null;
  const thinking = thinkingProp ?? split?.thinking ?? null;
  const answer = split ? split.answer : text;
  const done = thinkingDone ?? split?.thinkingDone ?? true;
  return (
    <div className="min-w-0 text-[15px] leading-7 break-words">
      {thinking ? <ThinkingBlock text={thinking} streaming={streaming && !done} done={done} durationMs={thinkingMs} /> : null}
      <Streamdown
        plugins={plugins}
        controls={controls}
        linkSafety={linkSafety}
        lineNumbers={false}
        isAnimating={streaming && done}
        caret="block"
        className={streaming ? "xai-streaming" : undefined}
      >
        {answer}
      </Streamdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
