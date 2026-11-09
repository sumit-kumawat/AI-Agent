"use client";

import Editor, { loader } from "@monaco-editor/react";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { DropdownMenu } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Command as CommandIcon,
  Files,
  FolderKanban,
  Code,
  Loader2,
  Menu,
  Moon,
  PanelBottom,
  Search,
  Sun,
  X,
} from "lucide-react";
import { IdeRequestError, errorMessage, ideFetch } from "@/components/ide/api";
import { BottomPanel, type BottomPanelHandle, type PanelTab, type Problem } from "@/components/ide/bottom-panel";
import { Explorer } from "@/components/ide/explorer";
import { Palette, type Command } from "@/components/ide/palette";
import { IdeRootContext } from "@/components/ide/root-context";
import { SearchPanel } from "@/components/ide/search-panel";
import { Splitter } from "@/components/ide/splitter";
import { useIdeTheme } from "@/components/ide/use-ide-theme";
import { useFeedback } from "@/components/feedback";
import { useChatChrome } from "@/components/chat/chat-shell";
import { Kbd } from "@/components/shortcut";
import { formatShortcut, usePlatform } from "@/lib/shortcuts";

loader.config({ paths: { vs: "/monaco/vs" } });

type Monaco = typeof import("monaco-editor");
const initMonaco = () => loader.init() as unknown as Promise<Monaco>;
type FileState = { status: "loading" | "ready" | "binary" | "error"; error?: string };
type Position = { line: number; column: number };

const uriFor = (path: string) => `file:///${path.split("/").map(encodeURIComponent).join("/")}`;
const nameOf = (path: string) => path.split("/").at(-1) ?? path;
const isUnder = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

const menuItem =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground";

export function Workbench({
  workspace,
  user,
}: {
  workspace: { id: string; name: string };
  user: { name: string; email: string };
}) {
  const { confirm, notify } = useFeedback();
  const { openMenu } = useChatChrome();
  const router = useRouter();
  const [theme, setTheme] = useIdeTheme();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  const [view, setView] = useState<"explorer" | "search">("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(264);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(260);
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [explorerKey, setExplorerKey] = useState(0);
  const [palette, setPalette] = useState<"files" | "commands" | null>(null);

  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, FileState>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [problems, setProblems] = useState<Problem[]>([]);
  const [output, setOutput] = useState<{ time: number; message: string }[]>([]);
  const [cursor, setCursor] = useState<Position & { language: string }>({ line: 1, column: 1, language: "" });
  const [minimap, setMinimap] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [dragTab, setDragTab] = useState<string | null>(null);

  const panelRef = useRef<BottomPanelHandle>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const meta = useRef(new Map<string, { mtime: number; saved: number; listener: IDisposable }>());
  const reveal = useRef(new Map<string, Position>());
  const tabsRef = useRef(tabs);
  const activeRef = useRef(active);
  const dirtyRef = useRef(dirty);
  const openFileRef = useRef<(path: string, position?: Position) => void>(() => {});
  useEffect(() => {
    tabsRef.current = tabs;
    activeRef.current = active;
    dirtyRef.current = dirty;
  }, [tabs, active, dirty]);

  const log = useCallback((message: string) => {
    setOutput((current) => [...current.slice(-499), { time: Date.now(), message }]);
  }, []);

  const markDirty = useCallback((path: string, isDirty: boolean) => {
    setDirty((current) => {
      if (current.has(path) === isDirty) return current;
      const next = new Set(current);
      if (isDirty) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const revealPending = useCallback(() => {
    const editor = editorRef.current;
    const path = activeRef.current;
    if (!editor || !path) return;
    const model = editor.getModel();
    if (!model || model.uri.toString() !== monacoRef.current?.Uri.parse(uriFor(path)).toString()) return;
    const position = reveal.current.get(path);
    if (!position) return;
    reveal.current.delete(path);
    editor.setPosition({ lineNumber: position.line, column: position.column });
    editor.revealPositionInCenter({ lineNumber: position.line, column: position.column });
    // A file can finish loading after a palette or popup opened; never steal its focus.
    if (!document.querySelector("[role=dialog], [role=alertdialog]")) editor.focus();
  }, []);

  const openFile = useCallback(
    async (path: string, position?: Position) => {
      if (position) reveal.current.set(path, position);
      setTabs((current) => {
        if (current.includes(path)) return current;
        const at = activeRef.current ? current.indexOf(activeRef.current) + 1 : current.length;
        return [...current.slice(0, at), path, ...current.slice(at)];
      });
      setActive(path);
      const monaco = monacoRef.current ?? (await initMonaco());
      monacoRef.current = monaco;
      const uri = monaco.Uri.parse(uriFor(path));
      if (monaco.editor.getModel(uri)) {
        setFiles((current) => (current[path]?.status === "ready" ? current : { ...current, [path]: { status: "ready" } }));
        requestAnimationFrame(revealPending);
        return;
      }
      setFiles((current) => ({ ...current, [path]: { status: "loading" } }));
      try {
        const file = await ideFetch<{ binary: boolean; content?: string; mtime: number }>(
          `/api/ide/workspaces/${workspace.id}/files?file=${encodeURIComponent(path)}`,
        );
        if (file.binary) {
          setFiles((current) => ({ ...current, [path]: { status: "binary" } }));
          return;
        }
        const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(file.content ?? "", undefined, uri);
        const listener = model.onDidChangeContent(() => {
          const entry = meta.current.get(path);
          markDirty(path, Boolean(entry && model.getAlternativeVersionId() !== entry.saved));
        });
        meta.current.set(path, { mtime: file.mtime, saved: model.getAlternativeVersionId(), listener });
        setFiles((current) => ({ ...current, [path]: { status: "ready" } }));
        requestAnimationFrame(revealPending);
      } catch (error) {
        setFiles((current) => ({ ...current, [path]: { status: "error", error: errorMessage(error) } }));
      }
    },
    [markDirty, revealPending, workspace.id],
  );
  useEffect(() => {
    openFileRef.current = (path, position) => void openFile(path, position);
  }, [openFile]);

  const disposeModel = useCallback((path: string) => {
    const entry = meta.current.get(path);
    entry?.listener.dispose();
    meta.current.delete(path);
    reveal.current.delete(path);
    monacoRef.current?.editor.getModel(monacoRef.current.Uri.parse(uriFor(path)))?.dispose();
  }, []);

  const save = useCallback(
    async (path: string | null = activeRef.current, force = false): Promise<boolean> => {
      if (!path) return false;
      const monaco = monacoRef.current;
      const model = monaco?.editor.getModel(monaco.Uri.parse(uriFor(path)));
      const entry = meta.current.get(path);
      if (!model || !entry) return false;
      const version = model.getAlternativeVersionId();
      try {
        const result = await ideFetch<{ mtime: number }>(`/api/ide/workspaces/${workspace.id}/files`, {
          method: "PUT",
          body: JSON.stringify({ path, content: model.getValue(), mtime: force ? null : entry.mtime }),
        });
        entry.mtime = result.mtime;
        entry.saved = version;
        markDirty(path, model.getAlternativeVersionId() !== version);
        log(`Saved ${path}`);
        return true;
      } catch (error) {
        if (error instanceof IdeRequestError && error.status === 409 && !force) {
          const overwrite = await confirm({
            title: `${nameOf(path)} changed on disk`,
            description: "Someone or something else changed this file after you opened it. Overwrite it with your version?",
            confirmLabel: "Overwrite",
            destructive: true,
          });
          return overwrite ? save(path, true) : false;
        }
        log(`Could not save ${path}: ${errorMessage(error)}`);
        void notify({ tone: "error", title: `Could not save ${nameOf(path)}`, description: errorMessage(error) });
        return false;
      }
    },
    [confirm, log, markDirty, notify, workspace.id],
  );

  const saveAll = useCallback(async () => {
    for (const path of [...dirtyRef.current]) await save(path);
  }, [save]);

  /** Removes tabs; `ask` confirms first when any of them has unsaved changes. */
  const closeTabs = useCallback(
    async (paths: string[], ask = true) => {
      const unsaved = paths.filter((path) => dirtyRef.current.has(path));
      if (ask && unsaved.length) {
        const ok = await confirm({
          title: unsaved.length === 1 ? `Discard changes to ${nameOf(unsaved[0]!)}?` : `Discard changes to ${unsaved.length} files?`,
          description: "Your unsaved edits will be lost.",
          confirmLabel: "Discard",
          destructive: true,
        });
        if (!ok) return false;
      }
      for (const path of paths) {
        disposeModel(path);
        markDirty(path, false);
      }
      const remaining = tabsRef.current.filter((tab) => !paths.includes(tab));
      setTabs(remaining);
      setFiles((current) => Object.fromEntries(Object.entries(current).filter(([path]) => !paths.includes(path))));
      if (activeRef.current && paths.includes(activeRef.current)) {
        const index = tabsRef.current.indexOf(activeRef.current);
        setActive(remaining[Math.min(index, remaining.length - 1)] ?? null);
      }
      return true;
    },
    [confirm, disposeModel, markDirty],
  );

  function handleRenamed(from: string, to: string) {
    const affected = tabsRef.current.filter((tab) => isUnder(tab, from));
    if (!affected.length) return;
    const wasActive = activeRef.current;
    for (const path of affected) disposeModel(path);
    const renamed = (path: string) => (isUnder(path, from) ? to + path.slice(from.length) : path);
    setTabs((current) => current.map(renamed));
    setFiles((current) => Object.fromEntries(Object.entries(current).filter(([path]) => !affected.includes(path))));
    if (wasActive && affected.includes(wasActive)) void openFile(renamed(wasActive));
  }

  function handleDeleted(path: string) {
    void closeTabs(tabsRef.current.filter((tab) => isUnder(tab, path)), false);
  }

  // Global Monaco setup: TypeScript options, cross-file navigation, and the Problems list.
  useEffect(() => {
    let disposed = false;
    const disposables: IDisposable[] = [];
    void initMonaco().then((monaco) => {
      if (disposed) return;
      monacoRef.current = monaco;
      const compilerOptions = {
        target: monaco.typescript.ScriptTarget.ESNext,
        module: monaco.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
        jsx: monaco.typescript.JsxEmit.ReactJSX,
        allowJs: true,
        allowNonTsExtensions: true,
        esModuleInterop: true,
      };
      monaco.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
      monaco.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
      // Without node_modules type definitions, semantic errors would be noise; syntax errors are real.
      monaco.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
      monaco.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
      disposables.push(
        monaco.editor.registerEditorOpener({
          openCodeEditor(_source, resource, selection) {
            if (resource.scheme !== "file") return false;
            const start =
              selection && "startLineNumber" in selection
                ? { line: selection.startLineNumber, column: selection.startColumn }
                : selection
                  ? { line: selection.lineNumber, column: selection.column }
                  : undefined;
            openFileRef.current(resource.path.replace(/^\//, ""), start);
            return true;
          },
        }),
        monaco.editor.onDidChangeMarkers(() => {
          const severity = (value: number): Problem["severity"] =>
            value >= monaco.MarkerSeverity.Error ? "error" : value >= monaco.MarkerSeverity.Warning ? "warning" : "info";
          const rank = { error: 0, warning: 1, info: 2 };
          setProblems(
            monaco.editor
              .getModelMarkers({})
              .filter((marker) => marker.resource.scheme === "file")
              .map((marker) => ({
                path: marker.resource.path.replace(/^\//, ""),
                line: marker.startLineNumber,
                column: marker.startColumn,
                message: marker.message,
                severity: severity(marker.severity),
                source: marker.source,
              }))
              .sort((a, b) => rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path) || a.line - b.line),
          );
        }),
      );
    });
    return () => {
      disposed = true;
      for (const disposable of disposables) disposable.dispose();
    };
  }, []);

  // Dispose every model when leaving the workspace.
  useEffect(() => {
    const models = meta.current;
    return () => {
      for (const path of [...models.keys()]) {
        models.get(path)?.listener.dispose();
        monacoRef.current?.editor.getModel(monacoRef.current.Uri.parse(uriFor(path)))?.dispose();
      }
      models.clear();
    };
  }, []);

  useEffect(() => {
    if (!dirty.size) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.size]);

  const runEditorAction = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor) {
      void notify({ tone: "info", title: "Open a file first" });
      return;
    }
    editor.focus();
    void editor.getAction(id)?.run();
  }, [notify]);

  const togglePanel = useCallback((tab?: PanelTab) => {
    if (tab) {
      setPanelTab(tab);
      setPanelOpen(true);
    } else setPanelOpen((open) => !open);
  }, []);

  const platform = usePlatform();
  const k = useCallback((combo: string) => formatShortcut(combo, platform), [platform]);

  const newTerminal = useCallback(() => {
    setPanelTab("terminal");
    setPanelOpen(true);
    panelRef.current?.newTerminal();
  }, []);

  const showView = useCallback((next: "explorer" | "search") => {
    setView(next);
    setSidebarOpen(true);
    if (next === "search") setSearchFocusKey((key) => key + 1);
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      { id: "file.quickOpen", label: "Go to File…", shortcut: k("mod+p"), run: () => setPalette("files") },
      { id: "file.save", label: "File: Save", shortcut: k("mod+s"), run: () => void save() },
      { id: "file.saveAll", label: "File: Save All", shortcut: k("mod+alt+s"), run: () => void saveAll() },
      { id: "editor.close", label: "View: Close Editor", run: () => activeRef.current && void closeTabs([activeRef.current]) },
      { id: "editor.closeAll", label: "View: Close All Editors", run: () => void closeTabs([...tabsRef.current]) },
      { id: "search.files", label: "Search: Find in Files", shortcut: k("mod+shift+f"), run: () => showView("search") },
      { id: "view.explorer", label: "View: Show Explorer", shortcut: k("mod+shift+e"), run: () => showView("explorer") },
      { id: "view.sidebar", label: "View: Toggle Sidebar", shortcut: k("mod+b"), run: () => setSidebarOpen((open) => !open) },
      { id: "view.panel", label: "View: Toggle Panel", shortcut: k("ctrl+`"), run: () => togglePanel() },
      { id: "view.problems", label: "View: Show Problems", run: () => togglePanel("problems") },
      { id: "view.output", label: "View: Show Output", run: () => togglePanel("output") },
      { id: "terminal.new", label: "Terminal: New Terminal", shortcut: k("ctrl+shift+`"), run: newTerminal },
      { id: "explorer.refresh", label: "Explorer: Refresh", run: () => setExplorerKey((key) => key + 1) },
      { id: "editor.format", label: "Format Document", shortcut: k("shift+alt+f"), run: () => runEditorAction("editor.action.formatDocument") },
      { id: "editor.find", label: "Find", shortcut: k("mod+f"), run: () => runEditorAction("actions.find") },
      {
        id: "editor.replace",
        label: "Replace",
        shortcut: platform === "mac" ? k("mod+alt+f") : k("ctrl+h"),
        run: () => runEditorAction("editor.action.startFindReplaceAction"),
      },
      { id: "editor.gotoLine", label: "Go to Line…", shortcut: k("ctrl+g"), run: () => runEditorAction("editor.action.gotoLine") },
      { id: "editor.definition", label: "Go to Definition", shortcut: k("f12"), run: () => runEditorAction("editor.action.revealDefinition") },
      { id: "editor.references", label: "Find All References", shortcut: k("shift+f12"), run: () => runEditorAction("editor.action.referenceSearch.trigger") },
      { id: "editor.rename", label: "Rename Symbol", shortcut: k("f2"), run: () => runEditorAction("editor.action.rename") },
      { id: "editor.foldAll", label: "Fold All", run: () => runEditorAction("editor.foldAll") },
      { id: "editor.unfoldAll", label: "Unfold All", run: () => runEditorAction("editor.unfoldAll") },
      { id: "editor.minimap", label: "View: Toggle Minimap", run: () => setMinimap((on) => !on) },
      { id: "editor.wordWrap", label: "View: Toggle Word Wrap", shortcut: k("alt+z"), run: () => setWordWrap((on) => !on) },
      {
        id: "theme.toggle",
        label: `Preferences: Switch to ${theme === "dark" ? "Light" : "Dark"} Theme`,
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      { id: "nav.workspaces", label: "Go to Workspaces", run: () => router.push("/ide") },
      { id: "nav.chat", label: "Go to Chat", run: () => router.push("/chat") },
    ],
    [closeTabs, k, newTerminal, platform, router, runEditorAction, save, saveAll, setTheme, showView, theme, togglePanel],
  );

  // Workbench keyboard shortcuts. Ctrl-only chords are left to the shell when a terminal has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const inTerminal = (event.target as HTMLElement | null)?.closest?.("[data-terminal]") && !event.metaKey;
      const key = event.key.toLowerCase();
      if (event.ctrlKey && (event.key === "`" || event.code === "Backquote")) {
        event.preventDefault();
        if (event.shiftKey) newTerminal();
        else togglePanel();
        return;
      }
      if (!mod || inTerminal) return;
      if (key === "s") {
        event.preventDefault();
        if (event.altKey) void saveAll();
        else void save();
      } else if (key === "p") {
        event.preventDefault();
        setPalette(event.shiftKey ? "commands" : "files");
      } else if (key === "f" && event.shiftKey) {
        event.preventDefault();
        showView("search");
      } else if (key === "e" && event.shiftKey) {
        event.preventDefault();
        showView("explorer");
      } else if (key === "b" && !event.shiftKey) {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [newTerminal, save, saveAll, showView, togglePanel]);

  const activeFile = active ? files[active] : undefined;
  const errorCount = problems.filter((problem) => problem.severity === "error").length;
  const warningCount = problems.filter((problem) => problem.severity === "warning").length;
  const sidebarStart = useRef(sidebarWidth);
  const panelStart = useRef(panelHeight);

  const activityButton = (on: boolean) =>
    `relative flex size-11 items-center justify-center text-muted-foreground hover:text-foreground ${on ? "text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded before:bg-primary" : ""}`;

  return (
    <IdeRootContext.Provider value={root}>
      <div
        ref={setRoot}
        data-ide
        className={`${theme === "dark" ? "dark" : ""} flex h-full flex-col overflow-hidden bg-background text-foreground`}
      >
        <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-2">
          <button type="button" onClick={openMenu} className="rounded p-1 md:hidden" aria-label="Open navigation">
            <Menu className="size-4" />
          </button>
          <Link href="/ide" className="flex items-center gap-1.5 px-1 text-sm font-medium" title="All workspaces">
            <Code className="size-4" />
            <span className="hidden sm:inline">IDE</span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/ide" className="truncate text-sm hover:underline" title="All workspaces">
            {workspace.name}
          </Link>
          <button
            type="button"
            onClick={() => setPalette("files")}
            className="mx-auto flex h-7 w-full max-w-md items-center gap-2 rounded-md border bg-background px-2.5 text-xs text-muted-foreground hover:border-ring"
            aria-label="Search files"
          >
            <Search className="size-3.5" />
            <span className="truncate">Search files in {workspace.name}</span>
            <Kbd combo="mod+p" className="ml-auto" />
          </button>
          <button
            type="button"
            onClick={() => setPalette("commands")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Command palette"
            title={`Command palette (${k("mod+shift+p")})`}
          >
            <CommandIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
                aria-label="Account menu"
              >
                {(user.name || user.email).charAt(0).toUpperCase()}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal container={root ?? undefined}>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                <DropdownMenu.Label className="truncate px-2 py-1.5 text-xs text-muted-foreground">{user.email}</DropdownMenu.Label>
                <DropdownMenu.Item className={menuItem} onSelect={() => router.push("/ide")}>
                  <FolderKanban className="size-4" /> Workspaces
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => router.push("/chat")}>
                  Chat
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => router.push("/admin")}>
                  Admin panel
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => router.push("/account/password")}>
                  Change password
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item className={menuItem} onSelect={() => void signOut({ callbackUrl: "/login" })}>
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav aria-label="Views" className="flex w-11 shrink-0 flex-col border-r bg-sidebar">
            <button
              type="button"
              className={activityButton(sidebarOpen && view === "explorer")}
              onClick={() => (sidebarOpen && view === "explorer" ? setSidebarOpen(false) : showView("explorer"))}
              aria-label="Explorer"
              title={`Explorer (${k("mod+shift+e")})`}
            >
              <Files className="size-5" />
            </button>
            <button
              type="button"
              className={activityButton(sidebarOpen && view === "search")}
              onClick={() => (sidebarOpen && view === "search" ? setSidebarOpen(false) : showView("search"))}
              aria-label="Search"
              title={`Search (${k("mod+shift+f")})`}
            >
              <Search className="size-5" />
            </button>
            <button
              type="button"
              className={`${activityButton(panelOpen)} mt-auto`}
              onClick={() => togglePanel()}
              aria-label="Toggle panel"
              title={`Toggle panel (${k("ctrl+`")})`}
            >
              <PanelBottom className="size-5" />
            </button>
          </nav>

          {sidebarOpen ? (
            <>
              <aside className="min-h-0 shrink-0 bg-sidebar" style={{ width: sidebarWidth }}>
                <div className={view === "explorer" ? "h-full" : "hidden"}>
                  <Explorer
                    workspaceId={workspace.id}
                    workspaceName={workspace.name}
                    activePath={active}
                    refreshKey={explorerKey}
                    onOpen={(path) => void openFile(path)}
                    onRenamed={handleRenamed}
                    onDeleted={handleDeleted}
                    isBusy={(path) => [...dirty].some((item) => isUnder(item, path))}
                    log={log}
                  />
                </div>
                <div className={view === "search" ? "h-full" : "hidden"}>
                  <SearchPanel workspaceId={workspace.id} focusKey={searchFocusKey} onOpen={(path, position) => void openFile(path, position)} />
                </div>
              </aside>
              <Splitter
                direction="horizontal"
                label="Resize sidebar"
                onResize={(delta, phase) => {
                  if (phase === "start") sidebarStart.current = sidebarWidth;
                  else setSidebarWidth(Math.min(Math.max(sidebarStart.current + delta, 180), 600));
                }}
              />
            </>
          ) : null}

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
              {tabs.length ? (
                <div role="tablist" aria-label="Open editors" className="flex h-9 shrink-0 overflow-x-auto border-b bg-sidebar">
                  {tabs.map((path) => {
                    const on = path === active;
                    const isDirty = dirty.has(path);
                    return (
                      <div
                        key={path}
                        role="tab"
                        aria-selected={on}
                        draggable
                        onDragStart={() => setDragTab(path)}
                        onDragEnd={() => setDragTab(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!dragTab || dragTab === path) return;
                          setTabs((current) => {
                            const without = current.filter((tab) => tab !== dragTab);
                            const at = without.indexOf(path);
                            return [...without.slice(0, at), dragTab, ...without.slice(at)];
                          });
                        }}
                        onMouseDown={(event) => {
                          if (event.button === 1) {
                            event.preventDefault();
                            void closeTabs([path]);
                          }
                        }}
                        onClick={() => void openFile(path)}
                        title={path}
                        className={`group flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r pr-1 pl-3 text-[13px] ${
                          on ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
                        } ${dragTab === path ? "opacity-50" : ""}`}
                      >
                        <span className="max-w-48 truncate">{nameOf(path)}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void closeTabs([path]);
                          }}
                          className="relative inline-flex size-5 items-center justify-center rounded hover:bg-muted"
                          aria-label={`Close ${nameOf(path)}${isDirty ? " (unsaved)" : ""}`}
                        >
                          {isDirty ? (
                            <span className="size-2 rounded-full bg-foreground group-hover:hidden" aria-hidden />
                          ) : null}
                          <X className={`size-3.5 ${isDirty ? "hidden group-hover:block" : on ? "" : "opacity-0 group-hover:opacity-100"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {active ? (
                <p className="flex h-6 shrink-0 items-center gap-1 truncate px-3 text-xs text-muted-foreground">
                  {active.split("/").join(" › ")}
                </p>
              ) : null}
              <div className="relative min-h-0 flex-1">
                {!active ? (
                  <EmptyEditor onQuickOpen={() => setPalette("files")} onCommands={() => setPalette("commands")} onTerminal={newTerminal} />
                ) : activeFile?.status === "ready" ? (
                  <Editor
                    path={uriFor(active)}
                    theme={theme === "dark" ? "vs-dark" : "vs"}
                    keepCurrentModel
                    loading={<Loading label="Starting the editor…" />}
                    options={{
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                      minimap: { enabled: minimap },
                      wordWrap: wordWrap ? "on" : "off",
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                      smoothScrolling: true,
                      tabSize: 2,
                      renderWhitespace: "selection",
                      bracketPairColorization: { enabled: true },
                      guides: { bracketPairs: true, indentation: true },
                      stickyScroll: { enabled: true },
                      fixedOverflowWidgets: true,
                    }}
                    onMount={(editor) => {
                      editorRef.current = editor;
                      const update = () => {
                        const position = editor.getPosition();
                        setCursor({
                          line: position?.lineNumber ?? 1,
                          column: position?.column ?? 1,
                          language: editor.getModel()?.getLanguageId() ?? "",
                        });
                      };
                      editor.onDidChangeCursorPosition(update);
                      editor.onDidChangeModel(() => {
                        update();
                        requestAnimationFrame(revealPending);
                      });
                      editor.onDidDispose(() => {
                        if (editorRef.current === editor) editorRef.current = null;
                      });
                      update();
                      requestAnimationFrame(revealPending);
                    }}
                  />
                ) : activeFile?.status === "binary" ? (
                  <Notice>This is a binary file and cannot be shown in the editor.</Notice>
                ) : activeFile?.status === "error" ? (
                  <Notice tone="error">
                    {activeFile.error}{" "}
                    <button type="button" className="text-primary hover:underline" onClick={() => active && void openFile(active)}>
                      Try again
                    </button>
                  </Notice>
                ) : (
                  <Loading label={`Opening ${nameOf(active)}…`} />
                )}
              </div>
            </div>

            {panelOpen ? (
                <Splitter
                  direction="vertical"
                  label="Resize panel"
                  onResize={(delta, phase) => {
                    if (phase === "start") panelStart.current = panelHeight;
                    else setPanelHeight(Math.min(Math.max(panelStart.current - delta, 120), window.innerHeight - 200));
                  }}
                />
            ) : null}
            <div className={panelOpen ? "shrink-0" : "hidden"} style={{ height: panelHeight }}>
                  <BottomPanel
                    workspaceId={workspace.id}
                    theme={theme}
                    tab={panelTab}
                    onTab={setPanelTab}
                    onClose={() => setPanelOpen(false)}
                    problems={problems}
                    output={output}
                    handle={panelRef}
                    onOpenProblem={(problem) => void openFile(problem.path, { line: problem.line, column: problem.column })}
                  />
            </div>
          </main>
        </div>

        <footer className="flex h-6 shrink-0 items-center gap-3 border-t bg-sidebar px-3 text-xs text-muted-foreground">
          <button type="button" className="flex items-center gap-2 hover:text-foreground" onClick={() => togglePanel("problems")} title="Show problems">
            <span className="flex items-center gap-1">
              <AlertCircle className="size-3.5" /> {errorCount}
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="size-3.5" /> {warningCount}
            </span>
          </button>
          {dirty.size ? <span>{dirty.size} unsaved</span> : null}
          <span className="ml-auto" />
          {active && activeFile?.status === "ready" ? (
            <>
              <button type="button" className="hover:text-foreground" onClick={() => runEditorAction("editor.action.gotoLine")} title="Go to line">
                Ln {cursor.line}, Col {cursor.column}
              </button>
              <span>{cursor.language}</span>
            </>
          ) : null}
          <span>{theme === "dark" ? "Dark" : "Light"}</span>
        </footer>

        <Palette
          mode={palette}
          onClose={() => setPalette(null)}
          workspaceId={workspace.id}
          commands={commands}
          onOpenFile={(path) => void openFile(path)}
        />
      </div>
    </IdeRootContext.Provider>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className={`flex h-full items-center justify-center px-6 text-center text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      <p>{children}</p>
    </div>
  );
}

function EmptyEditor({ onQuickOpen, onCommands, onTerminal }: { onQuickOpen: () => void; onCommands: () => void; onTerminal: () => void }) {
  const row = "flex w-64 items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <button type="button" className={row} onClick={onQuickOpen}>
        Go to file <Kbd combo="mod+p" />
      </button>
      <button type="button" className={row} onClick={onCommands}>
        Show all commands <Kbd combo="mod+shift+p" />
      </button>
      <button type="button" className={row} onClick={onTerminal}>
        New terminal <Kbd combo="ctrl+shift+`" />
      </button>
    </div>
  );
}
