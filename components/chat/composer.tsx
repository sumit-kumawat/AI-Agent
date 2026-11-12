"use client";

import { ArrowUp, Brain, Globe, Lock, Paperclip, Square, Telescope, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttachmentTray, type Attachments } from "@/components/chat/attachments";
import { ACCEPT_FILES, SUPPORTED_SUMMARY } from "@/lib/attachments/types";
import { ModelPicker, type ModelOption } from "@/components/chat/model-picker";
import { autoModeOf, type AutoMode } from "@/lib/model-ref";
import type { UsageSummary } from "@/lib/plans/types";
import type { ResearchStatus } from "@/components/chat/research";
import { Button } from "@/components/ui/button";

const MAX_HEIGHT = 208;

export type SearchToggle = {
  on: boolean;
  onChange: (on: boolean) => void;
  available: boolean | null;
  reason: string | null;
};

export type DeepThinkToggle = {
  on: boolean;
  onChange: (on: boolean) => void;
  /** True when the selected model reports reasoning support. */
  supported: boolean;
  /** Installed reasoning models the user can switch to. */
  alternatives: ModelOption[];
};

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
  files: attachments,
  research,
  search,
  deepThink,
  locked,
  mode,
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
  /** When false, Enter inserts a newline and Cmd/Ctrl+Enter sends. */
  sendWithEnter?: boolean;
  note?: string;
  /** Enables attaching files. */
  files?: Attachments;
  /** Enables the Deep Research toggle. */
  research?: { on: boolean; onChange: (on: boolean) => void; status: ResearchStatus | null };
  /** DeepSeek-style web Search, next to the model selector. */
  search?: SearchToggle;
  /** DeepSeek-style DeepThink, next to Search. */
  deepThink?: DeepThinkToggle;
  /** Capabilities the plan does not include; their controls become upgrade links. */
  locked?: UsageSummary["locked"];
  /** The optimisation mode Auto uses. */
  mode?: AutoMode;
}) {
  const files = locked?.attachments ? undefined : attachments;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const selected = models.find((option) => option.key === model);
  const auto = autoModeOf(model) !== null;
  const hasImage = files?.items.some((item) => item.kind === "image") ?? false;
  const blocked =
    files?.uploading
      ? "Waiting for files to finish uploading…"
      : files?.failed
        ? "Remove or replace the files that could not be attached."
        : hasImage && auto && !models.some((option) => option.vision)
          ? "None of the available models can read images. Remove the image."
          : hasImage && selected && !selected.vision
            ? `${selected.name} cannot read images. Pick a model marked “Images”, or switch to Auto.`
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
        {files ? <AttachmentTray files={files} disabled={pending} /> : null}
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
                  accept={ACCEPT_FILES}
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
                  title={`Attach files: ${SUPPORTED_SUMMARY}. You can also drop or paste them.`}
                  disabled={pending}
                  onClick={() => picker.current?.click()}
                >
                  <Paperclip />
                </Button>
              </>
            ) : attachments && locked?.attachments ? (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-full text-muted-foreground"
                data-attachments-locked={locked.attachments.requiredPlan?.id ?? ""}
                title={locked.attachments.message}
              >
                <Link href={`/plans?highlight=${locked.attachments.requiredPlan?.id ?? ""}`} aria-label={`Attach files: ${locked.attachments.message}`}>
                  <Paperclip />
                </Link>
              </Button>
            ) : null}
            {research && locked?.research ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-full px-2.5 text-xs text-muted-foreground"
                data-research-locked={locked.research.requiredPlan?.id ?? ""}
                title={locked.research.message}
              >
                <Link href={`/plans?highlight=${locked.research.requiredPlan?.id ?? ""}`}>
                  <Lock className="size-3.5" />
                  <span className="hidden sm:inline">Deep Research</span>
                  {locked.research.requiredPlan ? (
                    <span className="rounded bg-muted px-1 text-[10px] font-medium uppercase">{locked.research.requiredPlan.name}</span>
                  ) : null}
                </Link>
              </Button>
            ) : research ? (
              <Button
                type="button"
                variant={researching ? "secondary" : "ghost"}
                size="sm"
                className={`h-8 shrink-0 rounded-full px-2.5 text-xs ${researching ? "text-primary ring-1 ring-primary/30" : "text-muted-foreground"}`}
                aria-pressed={researching}
                data-research-toggle
                disabled={busy || pending || (!researching && research.status?.available !== true)}
                title={
                  research.status === null
                    ? "Checking research sources…"
                    : research.status.available
                      ? researching
                        ? "Deep Research is on: your next message starts a cited web report. Click to turn it off."
                        : "Deep Research: searches the web, reads sources and writes a cited report"
                      : (research.status.reason ?? "Deep Research is unavailable")
                }
                onClick={() => research.onChange(!researching)}
              >
                <Telescope className="size-3.5" />
                <span className="hidden sm:inline">Deep Research</span>
                {researching ? <X className="size-3.5" aria-hidden /> : null}
              </Button>
            ) : null}
            <ModelPicker models={models} value={model} onChange={onModelChange} disabled={busy} compact mode={mode} />
            {search ? (
              <Button
                type="button"
                variant={search.on ? "secondary" : "ghost"}
                size="icon"
                className={`size-8 shrink-0 rounded-full ${search.on ? "text-primary ring-1 ring-primary/30" : "text-muted-foreground"}`}
                aria-pressed={search.on}
                aria-label="Search"
                data-search-toggle
                disabled={busy || pending || (!search.on && search.available === false)}
                title={
                  search.available === null
                    ? "Checking search…"
                    : search.available === false
                      ? (search.reason ?? "Search is unavailable")
                      : search.on
                        ? "Search is on for this chat"
                        : "Search the web for this chat"
                }
                onClick={() => search.onChange(!search.on)}
              >
                <Globe className="size-4" />
              </Button>
            ) : null}
            {deepThink ? (
              <Button
                type="button"
                variant={deepThink.on ? "secondary" : "ghost"}
                size="icon"
                className={`size-8 shrink-0 rounded-full ${deepThink.on ? "text-primary ring-1 ring-primary/30" : "text-muted-foreground"}`}
                aria-pressed={deepThink.on}
                aria-label="DeepThink"
                data-deepthink-toggle
                disabled={busy || pending}
                title={
                  deepThink.on
                    ? deepThink.supported
                      ? "DeepThink is on for this chat"
                      : "DeepThink is on, but this assistant may not support reasoning"
                    : "DeepThink: show step-by-step reasoning before the answer"
                }
                onClick={() => deepThink.onChange(!deepThink.on)}
              >
                <Brain className="size-4" />
              </Button>
            ) : null}
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
      {deepThink?.on && !deepThink.supported ? (
        <p className="mt-1.5 px-1 text-xs text-amber-700 dark:text-amber-400" data-deepthink-warning role="status">
          This assistant does not report reasoning support.
          {deepThink.alternatives[0] ? (
            <>
              {" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => onModelChange(deepThink.alternatives[0]!.key)}
              >
                Switch to {deepThink.alternatives[0]!.name}
              </button>
            </>
          ) : (
            " Install a reasoning model such as deepseek-r1 to use DeepThink."
          )}
        </p>
      ) : null}
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
