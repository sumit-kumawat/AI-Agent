"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function Body({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function MarkdownImpl({ text }: { text: string }) {
  const { thinking, answer, thinkingDone } = splitThinking(text);
  return (
    <div className="prose prose-sm max-w-none break-words prose-neutral prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-foreground prose-pre:text-background prose-code:break-words prose-code:before:content-none prose-code:after:content-none">
      {thinking !== null ? (
        <details className="not-prose mb-3 rounded-lg border bg-background/60 px-3 py-2 text-xs text-muted-foreground" open={!thinkingDone}>
          <summary className="cursor-pointer select-none">
            {thinkingDone ? "Show reasoning" : "Thinking…"}
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{thinking}</p>
        </details>
      ) : null}
      <Body text={answer} />
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
