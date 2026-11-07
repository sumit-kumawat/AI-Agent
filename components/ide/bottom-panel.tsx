"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useImperativeHandle, useState, type Ref } from "react";
import { AlertCircle, AlertTriangle, Info, Loader2, Plus, SquareTerminal, Trash, X } from "lucide-react";
import { errorMessage, ideFetch } from "@/components/ide/api";
import { useFeedback } from "@/components/feedback";
import type { IdeTheme } from "@/components/ide/use-ide-theme";

const TerminalView = dynamic(() => import("@/components/ide/terminal-view").then((module) => module.TerminalView), {
  ssr: false,
});

export type Problem = {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  source?: string;
};

type TerminalInfo = { id: string; title: string; exitCode: number | null };
export type PanelTab = "terminal" | "problems" | "output";
export type BottomPanelHandle = { newTerminal: () => void };

export function BottomPanel({
  workspaceId,
  theme,
  tab,
  onTab,
  onClose,
  problems,
  output,
  onOpenProblem,
  handle,
}: {
  workspaceId: string;
  theme: IdeTheme;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  problems: Problem[];
  output: { time: number; message: string }[];
  onOpenProblem: (problem: Problem) => void;
  handle: Ref<BottomPanelHandle>;
}) {
  const { notify } = useFeedback();
  const [terminals, setTerminals] = useState<TerminalInfo[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = useCallback(async () => {
    setCreating(true);
    try {
      const { terminal } = await ideFetch<{ terminal: TerminalInfo }>("/api/ide/terminals", {
        method: "POST",
        body: JSON.stringify({ workspace: workspaceId, cols: 100, rows: 20 }),
      });
      setTerminals((current) => [...(current ?? []), terminal]);
      setActive(terminal.id);
      onTab("terminal");
    } catch (error) {
      void notify({ tone: "error", title: "Terminal not started", description: errorMessage(error) });
    } finally {
      setCreating(false);
    }
  }, [workspaceId, notify, onTab]);

  useEffect(() => {
    let cancelled = false;
    ideFetch<{ terminals: TerminalInfo[] }>(`/api/ide/terminals?workspace=${workspaceId}`)
      .then(({ terminals: existing }) => {
        if (cancelled) return;
        setTerminals(existing);
        setActive(existing.at(-1)?.id ?? null);
      })
      .catch(() => !cancelled && setTerminals([]));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useImperativeHandle(handle, () => ({ newTerminal: () => void create() }), [create]);

  async function kill(id: string) {
    try {
      await ideFetch(`/api/ide/terminals/${id}`, { method: "DELETE" });
    } catch {
      // Already gone on the server; drop it here too.
    }
    setTerminals((current) => {
      const next = (current ?? []).filter((item) => item.id !== id);
      if (active === id) setActive(next.at(-1)?.id ?? null);
      return next;
    });
  }

  const errors = problems.filter((problem) => problem.severity === "error").length;
  const warnings = problems.filter((problem) => problem.severity === "warning").length;
  const tabClass = (on: boolean) =>
    `h-full border-b-2 px-1 text-[11px] font-semibold tracking-wide uppercase ${on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-4 px-3">
        <button type="button" className={tabClass(tab === "problems")} onClick={() => onTab("problems")}>
          Problems {problems.length ? <span className="ml-1 rounded-full bg-muted px-1.5 font-normal">{problems.length}</span> : null}
        </button>
        <button type="button" className={tabClass(tab === "output")} onClick={() => onTab("output")}>
          Output
        </button>
        <button type="button" className={tabClass(tab === "terminal")} onClick={() => onTab("terminal")}>
          Terminal
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          {tab === "terminal" ? (
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void create()}
              disabled={creating}
              aria-label="New terminal"
              title="New terminal"
            >
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-4" />}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close panel"
            title="Close panel"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className={`h-full min-h-0 ${tab === "terminal" ? "flex" : "hidden"}`}>
          <div className="min-w-0 flex-1">
            {terminals === null ? (
              <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading terminals…
              </p>
            ) : terminals.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <p>No terminal open.</p>
                <button type="button" onClick={() => void create()} className="text-primary hover:underline" disabled={creating}>
                  Open a terminal in this workspace
                </button>
              </div>
            ) : (
              terminals.map((terminal) => (
                <TerminalView
                  key={terminal.id}
                  id={terminal.id}
                  theme={theme}
                  visible={tab === "terminal" && active === terminal.id}
                  onExit={(code) =>
                    setTerminals((current) =>
                      (current ?? []).map((item) => (item.id === terminal.id ? { ...item, exitCode: code } : item)),
                    )
                  }
                />
              ))
            )}
          </div>
          {terminals && terminals.length > 0 ? (
            <ul aria-label="Terminals" className="w-44 shrink-0 overflow-auto border-l py-1">
              {terminals.map((terminal) => (
                <li key={terminal.id} className={`group flex items-center gap-1.5 px-2 text-[13px] ${active === terminal.id ? "bg-accent" : "hover:bg-muted"}`}>
                  <button type="button" onClick={() => setActive(terminal.id)} className="flex h-6 min-w-0 flex-1 items-center gap-1.5 text-left">
                    <SquareTerminal className="size-3.5 shrink-0" />
                    <span className="truncate">{terminal.title}</span>
                    {terminal.exitCode !== null ? <span className="text-xs text-muted-foreground">exited</span> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void kill(terminal.id)}
                    className="inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                    aria-label={`Kill ${terminal.title}`}
                    title="Kill terminal"
                  >
                    <Trash className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {tab === "problems" ? (
          <div className="h-full overflow-auto pb-2">
            {problems.length === 0 ? (
              <p className="px-4 py-2 text-xs text-muted-foreground">No problems in open files.</p>
            ) : (
              <>
                <p className="px-4 pb-1 text-xs text-muted-foreground">
                  {errors} error{errors === 1 ? "" : "s"}, {warnings} warning{warnings === 1 ? "" : "s"} in open files
                </p>
                {problems.map((problem, index) => (
                  <button
                    type="button"
                    key={`${problem.path}:${problem.line}:${problem.column}:${index}`}
                    onClick={() => onOpenProblem(problem)}
                    className="flex w-full items-start gap-2 px-4 py-0.5 text-left text-[13px] hover:bg-muted/70"
                  >
                    {problem.severity === "error" ? (
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : problem.severity === "warning" ? (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    ) : (
                      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      {problem.message}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {problem.source ? `${problem.source} · ` : ""}
                        {problem.path} [{problem.line}, {problem.column}]
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        ) : null}

        {tab === "output" ? (
          <div className="h-full overflow-auto px-4 pb-2 font-mono text-xs">
            {output.length === 0 ? (
              <p className="py-1 text-muted-foreground">IDE activity (saves, file changes, errors) appears here.</p>
            ) : (
              output.map((line, index) => (
                <p key={index} className="py-px">
                  <span className="mr-2 text-muted-foreground">{new Date(line.time).toLocaleTimeString()}</span>
                  {line.message}
                </p>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
