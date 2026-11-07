"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied" : "Copy"}
      onClick={() => {
        void copyText(text).then(() => setCopied(true)).catch(() => undefined);
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="group flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 text-[15px] leading-7 break-words whitespace-pre-wrap sm:max-w-[75%]">
        {text}
      </div>
      <div className="flex opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <CopyButton text={text} />
      </div>
    </div>
  );
}

export function AssistantMessage({
  text,
  streaming,
  last,
  onRegenerate,
}: {
  text: string;
  streaming: boolean;
  last: boolean;
  onRegenerate?: () => void;
}) {
  return (
    <div className="group flex flex-col gap-1" data-role="assistant">
      {text ? (
        <Markdown text={text} streaming={streaming} />
      ) : streaming ? (
        <span className="harbor-caret text-[15px] leading-7" aria-label="Generating">▋</span>
      ) : null}
      {!streaming && text ? (
        <div
          className={`-ml-2 flex items-center gap-0.5 transition-opacity ${
            last ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
          }`}
        >
          <CopyButton text={text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "")} />
          {last && onRegenerate ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Regenerate response"
              title="Regenerate"
              onClick={onRegenerate}
            >
              <RefreshCw />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
