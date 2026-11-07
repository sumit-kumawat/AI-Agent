"use client";

import { Dialog } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { File, Loader2, Terminal } from "lucide-react";
import { errorMessage, ideFetch } from "@/components/ide/api";
import { useIdeRoot } from "@/components/ide/root-context";

export type Command = { id: string; label: string; shortcut?: string; run: () => void };

/** Scores a fuzzy match of `query` in `text` (higher is better), or -1 when it does not match. */
function fuzzy(query: string, text: string) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct !== -1) return 1000 - direct - (t.length - q.length) * 0.01 + (t.lastIndexOf("/") < direct ? 200 : 0);
  let score = 0;
  let position = 0;
  for (const char of q) {
    const found = t.indexOf(char, position);
    if (found === -1) return -1;
    score += found === position ? 5 : 1;
    position = found + 1;
  }
  return score;
}

export function Palette({
  mode,
  onClose,
  workspaceId,
  commands,
  onOpenFile,
}: {
  mode: "files" | "commands" | null;
  onClose: () => void;
  workspaceId: string;
  commands: Command[];
  onOpenFile: (path: string) => void;
}) {
  const portal = useIdeRoot();
  return (
    <Dialog.Root open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={portal}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/10" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(600px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
        >
          <Dialog.Title className="sr-only">{mode === "files" ? "Go to file" : "Command palette"}</Dialog.Title>
          {mode ? (
            <PaletteBody
              key={mode}
              mode={mode}
              workspaceId={workspaceId}
              commands={commands}
              onOpenFile={onOpenFile}
              onClose={onClose}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody({
  mode,
  workspaceId,
  commands,
  onOpenFile,
  onClose,
}: {
  mode: "files" | "commands";
  workspaceId: string;
  commands: Command[];
  onOpenFile: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(mode === "commands" ? ">" : "");
  const [files, setFiles] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const commandMode = query.startsWith(">");

  useEffect(() => {
    if (commandMode || files) return;
    let cancelled = false;
    ideFetch<{ files: string[] }>(`/api/ide/workspaces/${workspaceId}/files?all=1`)
      .then((data) => !cancelled && setFiles(data.files))
      .catch((cause) => !cancelled && setError(errorMessage(cause)));
    return () => {
      cancelled = true;
    };
  }, [commandMode, files, workspaceId]);

  const items = useMemo(() => {
    if (commandMode) {
      const needle = query.slice(1).trim();
      return commands
        .map((command) => ({ command, score: fuzzy(needle, command.label) }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(({ command }) => ({ key: command.id, label: command.label, hint: command.shortcut, kind: "command" as const, run: command.run }));
    }
    return (files ?? [])
      .map((path) => ({ path, score: fuzzy(query.trim(), path) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 200)
      .map(({ path }) => ({
        key: path,
        label: path.split("/").at(-1)!,
        hint: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
        kind: "file" as const,
        run: () => onOpenFile(path),
      }));
  }, [commandMode, commands, files, onOpenFile, query]);

  const current = Math.min(index, Math.max(items.length - 1, 0));

  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function choose(position: number) {
    const item = items[position];
    if (!item) return;
    onClose();
    // Let the dialog close before the action moves focus.
    setTimeout(item.run, 0);
  }

  return (
    <>
      <input
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex(Math.min(current + 1, items.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex(Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(current);
          }
        }}
        placeholder={commandMode ? "Type a command" : "Search files by name (type > for commands)"}
        aria-label={commandMode ? "Command" : "File name"}
        className="h-11 w-full border-b bg-transparent px-4 text-sm outline-none"
      />
      <ul ref={list} role="listbox" className="max-h-[50vh] overflow-auto py-1">
        {!commandMode && !files && !error ? (
          <li className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Indexing file names…
          </li>
        ) : null}
        {error ? <li className="px-4 py-2 text-sm text-destructive">{error}</li> : null}
        {items.length === 0 && (commandMode || files) ? (
          <li className="px-4 py-2 text-sm text-muted-foreground">{commandMode ? "No matching commands." : "No matching files."}</li>
        ) : null}
        {items.map((item, position) => (
          <li
            key={item.key}
            data-index={position}
            role="option"
            aria-selected={position === current}
            onMouseMove={() => setIndex(position)}
            onClick={() => choose(position)}
            className={`flex cursor-default items-center gap-2 px-4 py-1.5 text-sm ${position === current ? "bg-accent text-accent-foreground" : ""}`}
          >
            {item.kind === "file" ? <File className="size-4 shrink-0 text-muted-foreground" /> : <Terminal className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{item.label}</span>
            {item.hint ? <span className="ml-auto truncate pl-4 text-xs text-muted-foreground">{item.hint}</span> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
