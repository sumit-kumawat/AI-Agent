"use client";

import { ContextMenu } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { errorMessage, ideFetch } from "@/components/ide/api";
import { useFeedback } from "@/components/feedback";
import { useIdeRoot } from "@/components/ide/root-context";

type Entry = { name: string; path: string; kind: "file" | "dir"; ignored: boolean };

const menuItem =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive";

function parentOf(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function Explorer({
  workspaceId,
  workspaceName,
  activePath,
  refreshKey,
  onOpen,
  onRenamed,
  onDeleted,
  isBusy,
  log,
}: {
  workspaceId: string;
  workspaceName: string;
  activePath: string | null;
  refreshKey: number;
  onOpen: (path: string) => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
  /** True when the path (or something under it) has unsaved changes. */
  isBusy: (path: string) => boolean;
  log: (message: string) => void;
}) {
  const { confirm, prompt, notify } = useFeedback();
  const portal = useIdeRoot();
  const [children, setChildren] = useState<Record<string, Entry[] | "loading" | { error: string }>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [selected, setSelected] = useState<string | null>(null);
  const expandedRef = useRef(expanded);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  const load = useCallback(
    async (dir: string) => {
      setChildren((current) => (current[dir] && current[dir] !== "loading" ? current : { ...current, [dir]: "loading" }));
      try {
        const { entries } = await ideFetch<{ entries: Entry[] }>(
          `/api/ide/workspaces/${workspaceId}/files?dir=${encodeURIComponent(dir)}`,
        );
        setChildren((current) => ({ ...current, [dir]: entries }));
      } catch (error) {
        setChildren((current) => ({ ...current, [dir]: { error: errorMessage(error) } }));
      }
    },
    [workspaceId],
  );

  const refresh = useCallback(() => {
    for (const dir of expandedRef.current) void load(dir);
  }, [load]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  function toggle(dir: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        void load(dir);
      }
      return next;
    });
  }

  /** The folder new items go into: the selected folder, or the selected/active file's folder. */
  function targetDir(entry?: Entry) {
    if (entry) return entry.kind === "dir" ? entry.path : parentOf(entry.path);
    const base = selected ?? activePath;
    if (!base) return "";
    const known = Object.values(children).flatMap((list) => (Array.isArray(list) ? list : []));
    const match = known.find((item) => item.path === base);
    return match?.kind === "dir" ? base : parentOf(base);
  }

  async function create(kind: "file" | "dir", entry?: Entry) {
    const dir = targetDir(entry);
    const name = await prompt({
      title: kind === "file" ? "New file" : "New folder",
      description: `Inside ${dir ? dir : workspaceName}. Use slashes to create nested folders.`,
      label: "Name",
      placeholder: kind === "file" ? "index.ts" : "components",
      confirmLabel: "Create",
      maxLength: 255,
    });
    if (!name) return;
    const path = dir ? `${dir}/${name}` : name;
    try {
      const created = await ideFetch<{ path: string }>(`/api/ide/workspaces/${workspaceId}/files`, {
        method: "POST",
        body: JSON.stringify({ path, kind }),
      });
      log(`Created ${created.path}`);
      setExpanded((current) => new Set(current).add(dir));
      await load(parentOf(created.path));
      if (dir !== parentOf(created.path)) void load(dir);
      if (kind === "file") onOpen(created.path);
      setSelected(created.path);
    } catch (error) {
      void notify({ tone: "error", title: "Could not create it", description: errorMessage(error) });
    }
  }

  async function rename(entry: Entry) {
    if (isBusy(entry.path)) {
      void notify({ tone: "warning", title: "Unsaved changes", description: "Save or close the changed files first." });
      return;
    }
    const next = await prompt({
      title: `Rename ${entry.name}`,
      label: "New name or path",
      defaultValue: entry.path,
      confirmLabel: "Rename",
      maxLength: 500,
    });
    if (!next || next === entry.path) return;
    try {
      const renamed = await ideFetch<{ path: string }>(`/api/ide/workspaces/${workspaceId}/files`, {
        method: "PATCH",
        body: JSON.stringify({ from: entry.path, to: next }),
      });
      log(`Renamed ${entry.path} to ${renamed.path}`);
      onRenamed(entry.path, renamed.path);
      void load(parentOf(entry.path));
      void load(parentOf(renamed.path));
      setSelected(renamed.path);
    } catch (error) {
      void notify({ tone: "error", title: "Rename failed", description: errorMessage(error) });
    }
  }

  async function remove(entry: Entry) {
    const ok = await confirm({
      title: `Delete ${entry.name}?`,
      description: `${entry.kind === "dir" ? "The folder and everything in it" : "The file"} will be moved to the workspace trash on the server.${isBusy(entry.path) ? " Unsaved changes will be lost." : ""}`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await ideFetch(`/api/ide/workspaces/${workspaceId}/files?path=${encodeURIComponent(entry.path)}`, { method: "DELETE" });
      log(`Deleted ${entry.path}`);
      onDeleted(entry.path);
      void load(parentOf(entry.path));
    } catch (error) {
      void notify({ tone: "error", title: "Delete failed", description: errorMessage(error) });
    }
  }

  function renderDir(dir: string, depth: number): React.ReactNode {
    const list = children[dir];
    if (list === undefined || list === "loading") {
      return (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" style={{ paddingLeft: depth * 12 + 20 }}>
          <Loader2 className="size-3 animate-spin" /> Loading…
        </div>
      );
    }
    if (!Array.isArray(list)) {
      return (
        <p className="py-1 text-xs text-destructive" style={{ paddingLeft: depth * 12 + 20 }}>
          {list.error}
        </p>
      );
    }
    if (list.length === 0 && dir === "") {
      return <p className="px-4 py-3 text-xs text-muted-foreground">This workspace is empty. Create a file to start.</p>;
    }
    return list.map((entry) => {
      const open = entry.kind === "dir" && expanded.has(entry.path);
      const active = entry.path === activePath;
      return (
        <div key={entry.path}>
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <button
                type="button"
                data-path={entry.path}
                onClick={() => {
                  setSelected(entry.path);
                  if (entry.kind === "dir") toggle(entry.path);
                  else onOpen(entry.path);
                }}
                className={`flex h-[22px] w-full items-center gap-1 pr-2 text-left text-[13px] ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : selected === entry.path
                      ? "bg-muted"
                      : "hover:bg-muted/70"
                } ${entry.ignored ? "opacity-60" : ""}`}
                style={{ paddingLeft: depth * 12 + 6 }}
                title={entry.path}
              >
                {entry.kind === "dir" ? (
                  <>
                    {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                    {open ? <FolderOpen className="size-3.5 shrink-0 text-primary" /> : <Folder className="size-3.5 shrink-0 text-primary" />}
                  </>
                ) : (
                  <>
                    <span className="w-3.5 shrink-0" />
                    <File className="size-3.5 shrink-0 text-muted-foreground" />
                  </>
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal container={portal}>
              <ContextMenu.Content className="z-50 min-w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                {entry.kind === "file" ? (
                  <ContextMenu.Item className={menuItem} onSelect={() => onOpen(entry.path)}>
                    Open
                  </ContextMenu.Item>
                ) : null}
                <ContextMenu.Item className={menuItem} onSelect={() => void create("file", entry)}>
                  New file…
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItem} onSelect={() => void create("dir", entry)}>
                  New folder…
                </ContextMenu.Item>
                <ContextMenu.Separator className="my-1 h-px bg-border" />
                <ContextMenu.Item className={menuItem} onSelect={() => void navigator.clipboard?.writeText(entry.path)}>
                  Copy path
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItem} onSelect={() => void rename(entry)}>
                  Rename…
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItem} data-variant="destructive" onSelect={() => void remove(entry)}>
                  Delete
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
          {open ? renderDir(entry.path, depth + 1) : null}
        </div>
      );
    });
  }

  const toolbarButton = "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-0.5 px-3">
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {workspaceName}
        </p>
        <button type="button" className={toolbarButton} onClick={() => void create("file")} aria-label="New file" title="New file">
          <FilePlus className="size-4" />
        </button>
        <button type="button" className={toolbarButton} onClick={() => void create("dir")} aria-label="New folder" title="New folder">
          <FolderPlus className="size-4" />
        </button>
        <button type="button" className={toolbarButton} onClick={refresh} aria-label="Refresh explorer" title="Refresh">
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => setExpanded(new Set([""]))}
          aria-label="Collapse folders"
          title="Collapse folders"
        >
          <ChevronsDownUp className="size-4" />
        </button>
      </div>
      <nav aria-label="Files" className="min-h-0 flex-1 overflow-auto pb-4">
        {renderDir("", 0)}
      </nav>
    </div>
  );
}
