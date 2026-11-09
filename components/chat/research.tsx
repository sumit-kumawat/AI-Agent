"use client";

import { AlertCircle, Check, ChevronRight, CircleDashed, Loader2, Minus, Telescope } from "lucide-react";
import { useEffect, useState } from "react";
import type { ResearchData, ResearchStep } from "@/lib/research/types";

export type ResearchStatus = { available: boolean; reason: string | null; sources: { name: string; ok: boolean }[] };

/** Whether any configured search source answers. Checked once per page and again on demand. */
export function useResearchStatus() {
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/research/status")
      .then((response) => (response.ok ? (response.json() as Promise<ResearchStatus>) : null))
      .then((value) => {
        if (!cancelled) setStatus(value ?? { available: false, reason: "Could not check research sources.", sources: [] });
      })
      .catch(() => {
        if (!cancelled) setStatus({ available: false, reason: "Could not check research sources.", sources: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);
  return { status, recheck: () => setVersion((value) => value + 1) };
}

function StepIcon({ status }: { status: ResearchStep["status"] }) {
  if (status === "running") return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />;
  if (status === "done") return <Check className="size-3.5 shrink-0 text-primary" />;
  if (status === "failed") return <AlertCircle className="size-3.5 shrink-0 text-destructive" />;
  return <Minus className="size-3.5 shrink-0 text-muted-foreground" />;
}

function seconds(data: ResearchData) {
  if (!data.finishedAt) return null;
  const value = Math.round((data.finishedAt - data.startedAt) / 1000);
  return value < 60 ? `${value}s` : `${Math.floor(value / 60)}m ${value % 60}s`;
}

/** The plan, each search and page read, and their outcomes, as they happen. */
export function ResearchPanel({ data }: { data: ResearchData }) {
  const running = data.status === "running";
  // Open while running, closed once finished, unless the reader toggled it.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? running;
  const read = data.sources.filter((source) => source.read).length;
  const summary = running
    ? ([...data.steps].reverse().find((step) => step.status === "running")?.label ?? "Starting research…")
    : data.status === "failed"
      ? (data.error ?? "Research failed.")
      : `Researched ${data.sources.length} source${data.sources.length === 1 ? "" : "s"}${read < data.sources.length ? ` (${read} read in full)` : ""}${seconds(data) ? ` in ${seconds(data)}` : ""}`;

  return (
    <div className="mb-2 rounded-2xl border bg-card text-sm" data-research={data.status}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
        onClick={() => setToggled(!open)}
      >
        {running ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        ) : data.status === "failed" ? (
          <AlertCircle className="size-4 shrink-0 text-destructive" />
        ) : (
          <Telescope className="size-4 shrink-0 text-primary" />
        )}
        <span className="min-w-0 flex-1 truncate" aria-live="polite">
          {summary}
        </span>
        <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open ? (
        <div className="border-t px-3 py-2.5">
          {data.queries.length ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Queries: {data.queries.map((query) => `“${query}”`).join(", ")}
            </p>
          ) : null}
          <ol className="flex flex-col gap-1.5" data-research-steps>
            {data.steps.length === 0 ? (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleDashed className="size-3.5" />
                Starting…
              </li>
            ) : null}
            {data.steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2 text-xs" data-step={step.status}>
                <span className="mt-0.5">
                  <StepIcon status={step.status} />
                </span>
                <span className="min-w-0">
                  <span className={step.status === "failed" ? "text-foreground" : "text-foreground/90"}>{step.label}</span>
                  {step.detail ? <span className="block break-words text-muted-foreground">{step.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** Turns [2] and [1, 3] in a report into links to the numbered sources. */
export function linkCitations(text: string, data: ResearchData | undefined) {
  if (!data?.sources.length) return text;
  const urls = new Map(data.sources.map((source) => [source.n, source.url]));
  const [body, ...rest] = text.split(/\n## Sources\n/);
  const linked = body!.replace(/\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g, (match, list: string) => {
    const parts = list.split(/\s*,\s*/).map((value) => {
      const url = urls.get(Number(value));
      return url ? `[${value}](${url})` : value;
    });
    return `[${parts.join(", ")}]`;
  });
  return rest.length ? `${linked}\n## Sources\n${rest.join("\n## Sources\n")}` : linked;
}

export function exportReport(text: string, data: ResearchData | undefined, question: string | undefined) {
  const title = question?.trim() || "Research report";
  const header = [
    `# ${title}`,
    "",
    `_Deep Research report, ${new Date(data?.finishedAt ?? Date.now()).toLocaleString()}. ${data?.sources.length ?? 0} sources${
      data?.queries.length ? `; queries: ${data.queries.map((query) => `“${query}”`).join(", ")}` : ""
    }._`,
    "",
  ].join("\n");
  const blob = new Blob([`${header}\n${text.trim()}\n`], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "research"}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
