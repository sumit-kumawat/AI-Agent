"use client";

import { ArrowUp, Paperclip, Square, Telescope, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACCEPT, AttachmentTray, type Attachments } from "@/components/chat/attachments";
import { ModelPicker, type ModelOption } from "@/components/chat/model-picker";
import type { ResearchStatus } from "@/components/chat/research";
import { Button } from "@/components/ui/button";

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
  files,
  research,
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
  /** Enables attaching files. */
  files?: Attachments;
  /** Enables the Deep Research toggle. */
  research?: { on: boolean; onChange: (on: boolean) => void; status: ResearchStatus | null };
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const selected = models.find((option) => option.key === model);
  const hasImage = files?.items.some((item) => item.kind === "image") ?? false;
  const blocked =
    files?.uploading
      ? "Waiting for files to finish uploading…"
      : files?.failed
        ? "Remove or replace the files that could not be attached."
        : hasImage && selected && !selected.vision
          ? `${selected.name} cannot read images. Pick a model marked “Images”, or remove the image.`
          : null;
  const researching = research?.on === true;
  const hasContent = researching ? value.trim().length > 0 : value.trim().length > 0 || (files?.ready.length ?? 0) > 0;
  const canSend = hasContent && !blocked && model !== null && !busy && !pending;

  function addFiles(list: FileList | File[]) {
    if (!files) return;
    const problem = files.add([...list]);
    setFileProblem(problem);
  }

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
    if (!canSend) return;
    setFileProblem(null);
    onSubmit(value);
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragEnter={(event) => {
        if (files && event.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!files || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!files || event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <div
        className={`rounded-3xl border bg-card shadow-sm transition-colors focus-within:border-ring/60 ${
          dragging ? "border-primary bg-primary/5" : ""
        }`}
        data-dragging={dragging || undefined}
      >
        {files ? <AttachmentTray files={files} disabled={busy || pending} /> : null}
        <textarea
          ref={textarea}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            if (!files || event.clipboardData.files.length === 0) return;
            event.preventDefault();
            addFiles(event.clipboardData.files);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            const modified = event.metaKey || event.ctrlKey;
            if (sendWithEnter || modified) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={dragging ? "Drop files to attach" : researching ? "What should I research?" : "Ask anything"}
          aria-label="Message"
          enterKeyHint="send"
          rows={1}
          className="block max-h-52 min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-base leading-6 outline-none placeholder:text-muted-foreground md:text-[15px]"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            {files ? (
              <>
                <input
                  ref={picker}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  data-file-input
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 rounded-full text-muted-foreground"
                  aria-label="Attach files"
                  title="Attach files (PDF, Word, Excel, CSV, text, code, images)"
                  disabled={busy || pending}
                  onClick={() => picker.current?.click()}
                >
                  <Paperclip />
                </Button>
              </>
            ) : null}
            {research ? (
              <Button
                type="button"
                variant={researching ? "secondary" : "ghost"}
                size="sm"
                className={`h-9 shrink-0 rounded-full ${researching ? "text-primary" : "text-muted-foreground"}`}
                aria-pressed={researching}
                data-research-toggle
                disabled={busy || pending || (!researching && research.status?.available !== true)}
                title={
                  research.status === null
                    ? "Checking research sources…"
                    : research.status.available
                      ? "Deep Research: searches the web, reads sources and writes a cited report"
                      : (research.status.reason ?? "Deep Research is unavailable")
                }
                onClick={() => research.onChange(!researching)}
              >
                <Telescope />
                <span className="hidden sm:inline">Deep Research</span>
                {researching ? <X className="size-3.5" aria-hidden /> : null}
              </Button>
            ) : null}
            <ModelPicker models={models} value={model} onChange={onModelChange} disabled={busy} compact />
          </div>
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
      {error || fileProblem ? (
        <p className="mt-2 text-center text-sm text-destructive" role="alert">
          {error ?? fileProblem}
        </p>
      ) : blocked && hasContent ? (
        <p className="mt-2 text-center text-xs text-muted-foreground" data-composer-blocked>
          {blocked}
        </p>
      ) : (
        <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">
          {note ?? "Replies can be wrong. Check important information."}
        </p>
      )}
    </form>
  );
}
