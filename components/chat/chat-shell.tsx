"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Menu, Pencil, SquarePen } from "lucide-react";
import type { ModelOption } from "@/components/chat/model-picker";
import { jsonFetch, useConversationActions } from "@/components/chat/conversation-actions";
import { SearchDialog } from "@/components/chat/search-dialog";
import { SidebarBody } from "@/components/chat/sidebar";
import { useFeedback } from "@/components/feedback";
import { isSettingsTab, SettingsDialog, type SettingsTab } from "@/components/settings/settings-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyAppearance } from "@/lib/appearance";
import type { ConversationListItem } from "@/lib/db/queries";
import type { UsageSummary } from "@/lib/plans/types";
import type { Preferences } from "@/lib/preferences-schema";
import type { Role } from "@/lib/roles";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  publicId: string | null;
  username: string | null;
  createdAt: number;
};

type Chrome = {
  openMenu: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  models: ModelOption[];
  defaultModel: string | null;
  admin: boolean;
  user: ShellUser;
  usage: UsageSummary;
  prefs: Preferences;
  /** Saves a preference change; returns whether it stuck. */
  updatePrefs: (patch: Partial<Preferences>, success?: string) => Promise<boolean>;
  openSettings: (tab?: SettingsTab) => void;
  /** Opens chat search (also Cmd/Ctrl+K). */
  openSearch: () => void;
};

const ChatChromeContext = createContext<Chrome | null>(null);

export function useChatChrome() {
  const value = useContext(ChatChromeContext);
  if (!value) {
    throw new Error("Chat chrome is only available inside the chat layout.");
  }
  return value;
}

function saveCollapsed(value: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${value ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

/** Settings live in the URL hash (#settings/memory) so they can be linked and survive reloads. */
function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function setHash(hash: string) {
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function ChatShell({
  children,
  conversations,
  user,
  usage,
  preferences,
  models,
  defaultModel,
  admin,
  ollamaMessage,
  initialCollapsed,
}: {
  children: ReactNode;
  conversations: ConversationListItem[];
  user: ShellUser;
  usage: UsageSummary;
  preferences: Preferences;
  models: ModelOption[];
  defaultModel: string | null;
  admin: boolean;
  ollamaMessage: string | null;
  initialCollapsed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { notify, toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [prefs, setPrefs] = useState(preferences);
  const prefsRef = useRef(prefs);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      saveCollapsed(!current);
      return !current;
    });
  }, []);
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const hashName = hash.startsWith("#settings") ? (hash.split("/")[1] ?? "general") : null;
  const hashTab: SettingsTab | null = hashName === null ? null : isSettingsTab(hashName) ? hashName : "general";
  // The open tab lives in state: router refreshes can rewrite the URL without its hash.
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  if (hashTab !== null && hashTab !== settingsTab) setSettingsTab(hashTab);

  useEffect(() => {
    prefsRef.current = prefs;
    applyAppearance(prefs);
  }, [prefs]);

  const updatePrefs = useCallback(
    async (patch: Partial<Preferences>, success?: string) => {
      const previous = prefsRef.current;
      setPrefs({ ...previous, ...patch });
      try {
        const result = await jsonFetch<{ preferences: Preferences }>("/api/preferences", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setPrefs(result.preferences);
        if (success) toast(success);
        return true;
      } catch (error) {
        setPrefs(previous);
        void notify({ tone: "error", title: "Setting not saved", description: (error as Error).message });
        return false;
      }
    },
    [notify, toast],
  );

  const openSettings = useCallback((tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setHash(`#settings/${tab}`);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsTab(null);
    setHash("");
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      const onAdmin = pathname.startsWith("/admin");
      if (key === "k" && !event.shiftKey && !event.altKey) {
        if (onAdmin) return;
        // The IDE editor has its own Cmd/Ctrl+K chords.
        if ((event.target as HTMLElement | null)?.closest?.(".monaco-editor")) return;
        event.preventDefault();
        setOpen(false);
        setSearchOpen((current) => !current);
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        toggleCollapsed();
      } else if (key === "o" && event.shiftKey) {
        if (onAdmin) return;
        event.preventDefault();
        router.push("/chat");
      } else if (key === ",") {
        event.preventDefault();
        openSettings("general");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname, openSettings, toggleCollapsed]);

  const chrome = useMemo<Chrome>(
    () => ({
      openMenu: () => setOpen(true),
      collapsed,
      toggleCollapsed,
      models,
      defaultModel,
      admin,
      user,
      usage,
      prefs,
      updatePrefs,
      openSettings,
      openSearch: () => {
        setOpen(false);
        setSearchOpen(true);
      },
    }),
    [collapsed, toggleCollapsed, models, defaultModel, admin, user, usage, prefs, updatePrefs, openSettings],
  );

  return (
    <ChatChromeContext.Provider value={chrome}>
      <TooltipProvider>
      <div className="fixed inset-0 flex overflow-hidden bg-background">
        <aside
          aria-label="Sidebar"
          data-collapsed={collapsed}
          className={`hidden shrink-0 border-r transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex ${
            collapsed ? "w-14" : "w-64 lg:w-72"
          }`}
        >
          <SidebarBody conversations={conversations} collapsed={collapsed} onToggle={toggleCollapsed} />
        </aside>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-80 p-0 sm:max-w-80">
            <SheetHeader className="sr-only">
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            <SidebarBody conversations={conversations} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          {ollamaMessage ? (
            <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              {ollamaMessage}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} recent={conversations} />
      <SettingsDialog tab={settingsTab} onTabChange={(tab) => openSettings(tab)} onClose={closeSettings} />
      </TooltipProvider>
    </ChatChromeContext.Provider>
  );
}

export function ChatTopBar({
  title,
  detail,
  actions,
}: {
  title: ReactNode;
  detail?: string;
  actions?: ReactNode;
}) {
  const { openMenu } = useChatChrome();
  return (
    <header data-top-bar className="flex min-h-14 shrink-0 items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={openMenu}
        aria-label="Open conversations"
      >
        <Menu />
      </Button>
      <div className="min-w-0 flex-1 px-1">
        {typeof title === "string" ? <h1 className="truncate text-sm font-medium">{title}</h1> : title}
        {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      {actions}
      <Button asChild variant="ghost" size="icon" className="md:hidden">
        <Link href="/chat" aria-label="New chat">
          <SquarePen />
        </Link>
      </Button>
    </header>
  );
}

/** The conversation title in the top bar; click to rename. */
export function EditableTitle({ id, title }: { id: string; title: string }) {
  const actions = useConversationActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function save() {
    const next = draft.replace(/\s+/g, " ").trim();
    setEditing(false);
    if (next && next !== title) void actions.renameTo({ id, title }, next);
  }

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        maxLength={120}
        aria-label="Conversation title"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") setEditing(false);
        }}
        className="h-8 w-full max-w-md rounded-md border bg-background px-2 text-sm font-medium outline-none focus:border-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      className="group flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-left text-sm font-medium hover:bg-muted"
      title="Rename conversation"
    >
      <h1 className="truncate">{title}</h1>
      <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </button>
  );
}
