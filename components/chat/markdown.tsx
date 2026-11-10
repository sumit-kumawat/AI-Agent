"use client";

import { code } from "@streamdown/code";
import { memo } from "react";
import { Streamdown } from "streamdown";

const plugins = { code };
const controls = { code: { copy: true, download: false }, table: { copy: true, download: false, fullscreen: false }, mermaid: false };
const linkSafety = { enabled: false };

/** Splits reasoning-model output into its <think> block and the answer. */
function splitThinking(text: string) {
  const match = text.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/);
  if (!match) return { thinking: null, answer: text, thinkingDone: true };
  return {
    thinking: match[1]?.trim() ?? "",
    answer: text.slice(match[0].length),
    thinkingDone: match[2] === "</think>",
  };
}

function MarkdownImpl({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const { thinking, answer, thinkingDone } = splitThinking(text);
  return (
    <div className="min-w-0 text-[15px] leading-7 break-words">
      {thinking !== null ? (
        <details className="mb-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground" open={!thinkingDone}>
          <summary className="cursor-pointer select-none">
            {thinkingDone ? "Show reasoning" : "Thinking…"}
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{thinking}</p>
        </details>
      ) : null}
      <Streamdown
        plugins={plugins}
        controls={controls}
        linkSafety={linkSafety}
        lineNumbers={false}
        isAnimating={streaming && thinkingDone}
        caret="block"
        className={streaming ? "xai-streaming" : undefined}
      >
        {answer}
      </Streamdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
