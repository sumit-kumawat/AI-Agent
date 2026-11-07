"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronRight, File, Loader2, Regex } from "lucide-react";
import { errorMessage, ideFetch } from "@/components/ide/api";

type Match = { path: string; line: number; column: number; preview: string };
type Result = { matches: Match[]; truncated: boolean; files: number };

export function SearchPanel({
  workspaceId,
  onOpen,
  focusKey,
}: {
  workspaceId: string;
  onOpen: (path: string, position: { line: number; column: number }) => void;
  focusKey: number;
}) {
  const [query, setQuery] = useState("");
  const [include, setInclude] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusKey]);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, regex: regex ? "1" : "0", case: caseSensitive ? "1" : "0" });
        if (include.trim()) params.set("include", include.trim());
        const data = await ideFetch<Result>(`/api/ide/workspaces/${workspaceId}/search?${params}`, { signal: controller.signal });
        setResult(data);
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, include, regex, caseSensitive, workspaceId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const match of result?.matches ?? []) {
      const list = map.get(match.path) ?? [];
      list.push(match);
      map.set(match.path, list);
    }
    return [...map.entries()];
  }, [result]);

  const toggleClass = (on: boolean) =>
    `inline-flex size-6 items-center justify-center rounded ${on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`;

  const showResults = query.trim() !== "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center px-3">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Search</p>
      </div>
      <div className="space-y-1.5 px-3 pb-2">
        <div className="flex items-center gap-1 rounded-md border bg-background pr-1 focus-within:border-ring">
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search in files"
            className="h-7 min-w-0 flex-1 bg-transparent px-2 text-[13px] outline-none"
          />
          <button type="button" className={toggleClass(caseSensitive)} onClick={() => setCaseSensitive(!caseSensitive)} title="Match case" aria-pressed={caseSensitive}>
            <CaseSensitive className="size-4" />
          </button>
          <button type="button" className={toggleClass(regex)} onClick={() => setRegex(!regex)} title="Use regular expression" aria-pressed={regex}>
            <Regex className="size-3.5" />
          </button>
        </div>
        <input
          value={include}
          onChange={(event) => setInclude(event.target.value)}
          placeholder="Folder to search in, e.g. src"
          aria-label="Folder to search in"
          className="h-7 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
        />
        {showResults ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            {loading ? <Loader2 className="size-3 animate-spin" /> : null}
            {error
              ? <span className="text-destructive">{error}</span>
              : result
                ? `${result.matches.length} result${result.matches.length === 1 ? "" : "s"} in ${result.files} file${result.files === 1 ? "" : "s"}${result.truncated ? " (stopped early; narrow the search)" : ""}`
                : "Searching…"}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-4">
        {showResults
          ? grouped.map(([path, matches]) => {
              const isCollapsed = collapsed.has(path);
              return (
                <div key={path}>
                  <button
                    type="button"
                    className="flex h-[22px] w-full items-center gap-1 px-2 text-left text-[13px] hover:bg-muted/70"
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(path)) next.delete(path);
                        else next.add(path);
                        return next;
                      })
                    }
                    title={path}
                  >
                    {isCollapsed ? <ChevronRight className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
                    <File className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{path.split("/").at(-1)}</span>
                    <span className="truncate text-xs text-muted-foreground">{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""}</span>
                    <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{matches.length}</span>
                  </button>
                  {isCollapsed
                    ? null
                    : matches.map((match) => (
                        <button
                          type="button"
                          key={`${match.line}:${match.column}`}
                          className="block h-[22px] w-full truncate pr-2 pl-9 text-left font-mono text-xs hover:bg-muted/70"
                          onClick={() => onOpen(match.path, { line: match.line, column: match.column })}
                          title={`${match.path}:${match.line}`}
                        >
                          <span className="mr-2 text-muted-foreground">{match.line}</span>
                          {match.preview.trim()}
                        </button>
                      ))}
                </div>
              );
            })
          : (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Type to search every file in the workspace. Dependency, build and secret files are skipped.
            </p>
          )}
      </div>
    </div>
  );
}
