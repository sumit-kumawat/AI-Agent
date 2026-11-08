"use client";

import { ArrowUp, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { ModelPicker, type ModelOption } from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

const MAX_HEIGHT = 208;

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy = false,
  pending = false,
  models,
  model,
  onModelChange,
  error,
  sendWithEnter = true,
  note,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onStop?: () => void;
  /** A reply is streaming; the button becomes Stop. */
  busy?: boolean;
  /** Sending is in flight but cannot be stopped yet. */
  pending?: boolean;
  models: ModelOption[];
  model: string | null;
  onModelChange: (name: string) => void;
  error?: string | null;
  /** When false, Enter inserts a newline and Ctrl/⌘+Enter sends. */
  sendWithEnter?: boolean;
  note?: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && model !== null && !busy && !pending;

  useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`;
    node.style.overflowY = node.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  useEffect(() => {
    // Focus on devices with a mouse; on phones this would pop the keyboard open.
    if (window.matchMedia("(pointer: fine)").matches) textarea.current?.focus();
  }, []);

  function submit() {
    if (canSend) onSubmit(value);
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="rounded-3xl border bg-card shadow-sm transition-colors focus-within:border-ring/60">
        <textarea
          ref={textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            const modified = event.metaKey || event.ctrlKey;
            if (sendWithEnter || modified) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`Message ${BRAND.product}`}
          aria-label="Message"
          enterKeyHint="send"
          rows={1}
          className="block max-h-52 min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base leading-6 outline-none placeholder:text-muted-foreground md:text-[15px]"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <ModelPicker models={models} value={model} onChange={onModelChange} disabled={busy} compact />
          {busy ? (
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-center text-sm text-destructive">{error}</p>
      ) : (
        <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">
          {note ??
            (sendWithEnter
              ? "Replies can be wrong; check important information. Enter to send, Shift+Enter for a new line."
              : "Replies can be wrong; check important information. Ctrl/⌘+Enter to send.")}
        </p>
      )}
    </form>
  );
}
