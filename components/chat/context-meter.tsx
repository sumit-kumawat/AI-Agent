"use client";

import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORY_INFO, CONTEXT_CATEGORIES, type ContextSnapshot } from "@/lib/context/types";

const DRAFT_COLOR = "#0f766e";
const tokens = (value: number) => value.toLocaleString("en-US");

/** Fetches what the next turn would send; refetches when `version` changes. */
export function useContextSnapshot(input: { conversationId: string | null; model: string | null; temporary?: boolean; version: unknown }) {
  const [state, setState] = useState<{ key: string; snapshot: ContextSnapshot } | null>(null);
  const key = `${input.conversationId ?? ""}|${input.model ?? ""}|${input.temporary ? 1 : 0}|${String(input.version)}`;
  useEffect(() => {
    if (!input.model) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ model: input.model });
    if (input.conversationId) params.set("conversationId", input.conversationId);
    if (input.temporary) params.set("temporary", "1");
    fetch(`/api/context?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { context: ContextSnapshot } | null) => {
        if (data) setState({ key, snapshot: data.context });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [key, input.conversationId, input.model, input.temporary]);
  return state?.snapshot ?? null;
}

function windowNote(snapshot: ContextSnapshot, window: number) {
  const max = snapshot.window.max;
  if (snapshot.window.source === "running") {
    return max && max > window
      ? `This chat is loaded with ${tokens(window)} tokens. The model can go up to ${tokens(max)} when reloaded with a larger window.`
      : `Context window in use: ${tokens(window)} tokens (reported by the runtime).`;
  }
  if (snapshot.window.source === "assumed") {
    return max
      ? `Window not reported for this load; using ${tokens(window)} as a safe estimate (model maximum ${tokens(max)}).`
      : `Window not reported; using ${tokens(window)} as a safe estimate.`;
  }
  if (snapshot.window.source === "model") {
    return `Window from this model's settings: ${tokens(window)} tokens.`;
  }
  if (snapshot.window.source === "server") {
    return max && max > window
      ? `Server default window ${tokens(window)} tokens (model maximum ${tokens(max)}).`
      : `Server default window: ${tokens(window)} tokens.`;
  }
  if (snapshot.window.source === "maximum" && max) {
    return `Using the model maximum of ${tokens(max)} tokens.`;
  }
  return `Context window: ${tokens(window)} tokens.`;
}

/**
 * Context bar: how much of the model's window the next turn would use.
 * Category counts are length-based estimates; the last reply's exact count
 * (when the model reported one) is listed separately.
 */
export function ContextMeter({
  snapshot,
  draft,
  reported,
}: {
  snapshot: ContextSnapshot | null;
  /** Characters typed but not sent yet. */
  draft: number;
  /** What the model reported for the last reply. */
  reported?: { input: number; output: number } | null;
}) {
  const [open, setOpen] = useState(false);
  if (!snapshot || !snapshot.window.tokens) return null;
  const window = snapshot.window.tokens;
  const draftTokens = Math.ceil(draft / 4);
  const used = snapshot.estimatedTotal + draftTokens;
  const percent = Math.min(100, Math.round((used / window) * 100));
  const shown = used > 0 && percent === 0 ? "<1" : String(percent);
  const free = Math.max(0, window - used - snapshot.reservedForReply);
  const segments = CONTEXT_CATEGORIES.filter((category) => (snapshot.categories[category] ?? 0) > 0).map((category) => ({
    category,
    value: snapshot.categories[category]!,
    ...CATEGORY_INFO[category],
  }));
  const width = (value: number) => `${Math.max(0.6, (value / window) * 100)}%`;
  const tone = percent >= 90 ? "text-destructive" : percent >= 70 ? "text-amber-600" : "text-muted-foreground";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-context-meter
          data-context-percent={percent}
          aria-label={`Context: about ${tokens(used)} of ${tokens(window)} tokens used (${shown}%), estimated. Show breakdown.`}
          title="Estimated from the text that would be sent; open for the breakdown"
          onMouseEnter={() => setOpen(true)}
          className="flex h-7 min-w-0 shrink items-center gap-2 rounded-full px-2 text-xs whitespace-nowrap hover:bg-muted"
        >
          <span className={`tabular-nums ${tone}`} data-context-label>
            Context: ~{tokens(used)} of {tokens(window)} ({shown}%)
          </span>
          <span className="hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted sm:flex" aria-hidden>
            {segments.map((segment) => (
              <span key={segment.category} style={{ width: width(segment.value), background: segment.color }} />
            ))}
            {draftTokens > 0 ? <span style={{ width: width(draftTokens), background: DRAFT_COLOR, opacity: 0.5 }} /> : null}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        collisionPadding={8}
        className="w-80 max-w-[calc(100vw-1.5rem)] space-y-3 p-3 text-xs"
        onMouseLeave={() => setOpen(false)}
        data-context-breakdown
      >
        <div>
          <p className="text-sm font-medium">
            Context: ~{tokens(used)} of {tokens(window)} tokens ({shown}%)
          </p>
          <p className="text-muted-foreground" data-context-window-source={snapshot.window.source ?? ""}>
            {windowNote(snapshot, window)}
          </p>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {segments.map((segment) => (
            <span key={segment.category} style={{ width: width(segment.value), background: segment.color }} />
          ))}
          {draftTokens > 0 ? <span style={{ width: width(draftTokens), background: DRAFT_COLOR, opacity: 0.5 }} /> : null}
          <span
            style={{ width: width(snapshot.reservedForReply) }}
            className="ml-auto bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(100,116,139,0.35)_3px,rgba(100,116,139,0.35)_6px)]"
          />
        </div>
        <ul className="space-y-1">
          {segments.map((segment) => (
            <li key={segment.category} className="flex items-center gap-2" title={segment.description} data-context-category={segment.category}>
              <span className="size-2 shrink-0 rounded-sm" style={{ background: segment.color }} />
              <span className="flex-1">{segment.label}</span>
              <span className="tabular-nums text-muted-foreground" data-tokens={segment.value}>
                ~{tokens(segment.value)}
              </span>
            </li>
          ))}
          {draftTokens > 0 ? (
            <li className="flex items-center gap-2" data-context-category="draft">
              <span className="size-2 shrink-0 rounded-sm opacity-50" style={{ background: DRAFT_COLOR }} />
              <span className="flex-1">Your draft (not sent)</span>
              <span className="tabular-nums text-muted-foreground">~{tokens(draftTokens)}</span>
            </li>
          ) : null}
          <li className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-sm bg-slate-400/50" />
            <span className="flex-1">Reserved for reply</span>
            <span className="tabular-nums text-muted-foreground">{tokens(snapshot.reservedForReply)}</span>
          </li>
          <li className="flex items-center gap-2 font-medium">
            <span className="size-2 shrink-0" />
            <span className="flex-1">Remaining</span>
            <span className="tabular-nums" data-context-free={free}>
              {tokens(free)}
            </span>
          </li>
        </ul>
        {snapshot.summarized > 0 || snapshot.pendingSummary > 0 ? (
          <p className="rounded-md bg-amber-500/10 px-2 py-1.5" data-context-summary>
            {snapshot.summarized > 0 ? `${snapshot.summarized} older messages are represented by a summary. ` : ""}
            {snapshot.pendingSummary > 0 ? `${snapshot.pendingSummary} older messages will be summarised when you send.` : ""}
          </p>
        ) : null}
        {reported ? (
          <p data-context-reported={reported.input}>
            Last reply (exact, from the model): {tokens(reported.input)} prompt + {tokens(reported.output)} reply tokens.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Breakdowns are estimated from text length (~4 characters per token
            {segments.some((segment) => segment.category === "attachments") ? `, ~${tokens(600)} per image` : ""}).
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
