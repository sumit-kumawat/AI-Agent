"use client";

import { ArrowUp, Eraser, FileCode, Loader2, Sparkles, Square, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { Markdown } from "@/components/chat/markdown";
import { MODE_ICON } from "@/components/chat/optimisation";
import { AUTO_INFO, AUTO_MODES, type AutoMode } from "@/lib/model-ref";

export type AssistantContext = {
  file?: { path: string; content: string; language?: string };
  selection?: string;
};

type Turn = { role: "user" | "assistant"; content: string; model?: string; reason?: string; error?: boolean };

const MODE_KEY = "harbor-ide-mode";
const MAX_FILE_CHARS = 200_000;

/**
 * The IDE's coding assistant: questions about the open file (and selection),
 * answered by the plan's models and counted against the plan's IDE allowance.
 */
export function AssistantPanel({
  workspaceId,
  getContext,
  onClose,
}: {
  workspaceId: string;
  getContext: () => AssistantContext;
  onClose: () => void;
}) {
  const { models } = useChatChrome();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [includeFile, setIncludeFile] = useState(true);
  const [mode, setMode] = useState<AutoMode>(() => {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(MODE_KEY);
    return stored && (AUTO_MODES as readonly string[]).includes(stored) ? (stored as AutoMode) : "balance";
  });
  const [model, setModel] = useState("");
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const preview = getContext().file;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);

  async function ask() {
    const question = input.trim();
    if (!question || pending) return;
    const context = includeFile ? getContext() : {};
    const file = context.file && context.file.content.length <= MAX_FILE_CHARS ? context.file : undefined;
    const history: Turn[] = [...turns.filter((turn) => !turn.error), { role: "user", content: question }];
    setTurns([...turns, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setInput("");
    setPending(true);
    setUpgrade(null);
    const controller = new AbortController();
    abort.current = controller;
    const update = (patch: Partial<Turn>) =>
      setTurns((current) => [...current.slice(0, -1), { ...current.at(-1)!, ...patch }]);
    try {
      const response = await fetch(`/api/ide/workspaces/${workspaceId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
          ...(file ? { file } : {}),
          ...(file && context.selection ? { selection: context.selection } : {}),
          ...(model ? { model } : { mode }),
        }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string; plan?: { requiredPlan?: { id: string } | null } } | null;
        if (data?.plan) setUpgrade(data.plan.requiredPlan?.id ?? "");
        update({ content: data?.error ?? `The assistant could not answer (${response.status}).`, error: true });
        return;
      }
      update({
        model: decodeURIComponent(response.headers.get("X-Model") ?? ""),
        reason: response.headers.get("X-Auto-Reason") ? decodeURIComponent(response.headers.get("X-Auto-Reason")!) : undefined,
      });
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += value;
        update({ content: text });
      }
      if (!text.trim()) update({ content: "The model returned an empty reply. Try again or pick another model.", error: true });
    } catch (error) {
      if ((error as Error).name === "AbortError") update({ content: "Stopped." });
      else update({ content: "Could not reach the server. Check your connection.", error: true });
    } finally {
      abort.current = null;
      setPending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask();
    }
  }

  const select =
    "h-7 min-w-0 rounded-md border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  const ModeIcon = MODE_ICON[mode];

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar" data-ide-assistant>
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b px-3">
        <Sparkles className="size-4 text-muted-foreground" />
        <p className="flex-1 text-[11px] font-semibold tracking-wide uppercase">Assistant</p>
        <button
          type="button"
          onClick={() => setTurns([])}
          disabled={pending || turns.length === 0}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label="Clear conversation"
          title="Clear conversation"
        >
          <Eraser className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close assistant"
          title="Close assistant"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={list} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {turns.length === 0 ? (
          <div className="space-y-2 pt-6 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto size-5" />
            <p>Ask about the open file: explain it, find a bug, or write a change.</p>
            <p className="text-xs">The assistant reads the file you have open and any selection. It cannot run code or edit files.</p>
          </div>
        ) : (
          turns.map((turn, index) =>
            turn.role === "user" ? (
              <div key={index} className="ml-6 rounded-xl bg-muted px-3 py-2 text-sm whitespace-pre-wrap" data-assistant-turn="user">
                {turn.content}
              </div>
            ) : (
              <div key={index} className="min-w-0 text-sm" data-assistant-turn="assistant" data-error={turn.error ? "true" : undefined}>
                {turn.content ? (
                  turn.error ? (
                    <p className="text-destructive">{turn.content}</p>
                  ) : (
                    <div className="[&_div]:text-sm [&_div]:leading-6">
                      <Markdown text={turn.content} streaming={pending && index === turns.length - 1} />
                    </div>
                  )
                ) : (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Thinking…
                  </p>
                )}
                {turn.model ? (
                  <p className="mt-1 text-xs text-muted-foreground" data-assistant-model={turn.model} title={turn.reason}>
                    {turn.model}
                    {turn.reason ? " · Auto" : ""}
                  </p>
                ) : null}
              </div>
            ),
          )
        )}
        {upgrade !== null ? (
          <Link href={`/plans?highlight=${upgrade}`} className="block text-xs text-primary hover:underline">
            Compare plans
          </Link>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t p-2">
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeFile} onChange={(event) => setIncludeFile(event.target.checked)} />
          <FileCode className="size-3.5 shrink-0" />
          <span className="truncate" data-assistant-file={preview?.path ?? ""}>
            {preview
              ? preview.content.length > MAX_FILE_CHARS
                ? `${preview.path} is too large to send`
                : `Include ${preview.path}`
              : "No file open"}
          </span>
        </label>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Ask about this code"
          aria-label="Ask the assistant"
          className="w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <div className="flex items-center gap-1.5">
          <select
            className={`${select} max-w-40`}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            aria-label="Assistant model"
            title="Model"
          >
            <option value="">Auto</option>
            {models.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </select>
          {model ? null : (
            <span className="flex min-w-0 items-center gap-1">
              <ModeIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <select
                className={select}
                value={mode}
                onChange={(event) => {
                  const next = event.target.value as AutoMode;
                  setMode(next);
                  window.localStorage.setItem(MODE_KEY, next);
                }}
                aria-label="Optimisation"
                title={AUTO_INFO[mode].description}
              >
                {AUTO_MODES.map((option) => (
                  <option key={option} value={option}>
                    {AUTO_INFO[option].label}
                  </option>
                ))}
              </select>
            </span>
          )}
          {pending ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="ml-auto inline-flex size-7 items-center justify-center rounded-full bg-foreground text-background"
              aria-label="Stop"
              title="Stop"
            >
              <Square className="size-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void ask()}
              disabled={!input.trim()}
              className="ml-auto inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Send to assistant"
              title="Send (Enter)"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
