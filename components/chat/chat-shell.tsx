"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Menu, PanelLeftOpen, Pencil, SquarePen } from "lucide-react";
import type { ModelOption } from "@/components/chat/model-picker";
import { jsonFetch, useConversationActions } from "@/components/chat/conversation-actions";
import { SearchDialog } from "@/components/chat/search-dialog";
import { SidebarBody } from "@/components/chat/sidebar";
import { useFeedback } from "@/components/feedback";
import { isSettingsTab, SettingsDialog, type SettingsTab } from "@/components/settings/settings-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { applyAppearance } from "@/lib/appearance";
import type { ConversationListItem } from "@/lib/db/queries";
import type { Preferences } from "@/lib/preferences-schema";

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  createdAt: number;
  usage: { used: number; limit: number | null };
};

type Chrome = {
  openMenu: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  models: ModelOption[];
  defaultModel: string | null;
  admin: boolean;
  user: ShellUser;
  prefs: Preferences;
  /** Saves a preference change; returns whether it stuck. */
  updatePrefs: (patch: Partial<Preferences>, success?: string) => Promise<boolean>;
  openSettings: (tab?: SettingsTab) => void;
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

const COLLAPSED_KEY = "harbor-sidebar-collapsed";
const COLLAPSED_EVENT = "harbor-sidebar-change";

function subscribeCollapsed(callback: () => void) {
  window.addEventListener(COLLAPSED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Storage can be blocked; the sidebar simply resets on reload.
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
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
  preferences,
  models,
  defaultModel,
  admin,
  ollamaMessage,
}: {
  children: ReactNode;
  conversations: ConversationListItem[];
  user: ShellUser;
  preferences: Preferences;
  models: ModelOption[];
  defaultModel: string | null;
  admin: boolean;
  ollamaMessage: string | null;
}) {
  const router = useRouter();
  const { notify, toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [prefs, setPrefs] = useState(preferences);
  const prefsRef = useRef(prefs);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
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
      if (key === "k" && !event.shiftKey) {
        event.preventDefault();
        setSearchOpen(true);
      } else if (key === "o" && event.shiftKey) {
        event.preventDefault();
        router.push("/chat");
      } else if (key === ",") {
        event.preventDefault();
        openSettings("general");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, openSettings]);

  const chrome = useMemo<Chrome>(
    () => ({
      openMenu: () => setOpen(true),
      collapsed,
      toggleCollapsed: () => writeCollapsed(!collapsed),
      models,
      defaultModel,
      admin,
      user,
      prefs,
      updatePrefs,
      openSettings,
      openSearch: () => setSearchOpen(true),
    }),
    [collapsed, models, defaultModel, admin, user, prefs, updatePrefs, openSettings],
  );

  return (
    <ChatChromeContext.Provider value={chrome}>
      <div className="fixed inset-0 flex overflow-hidden bg-background">
        {collapsed ? null : (
          <aside className="hidden w-64 shrink-0 border-r md:flex lg:w-72" aria-label="Sidebar">
            <SidebarBody conversations={conversations} onCollapse={() => writeCollapsed(true)} />
          </aside>
        )}
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
  const { openMenu, collapsed, toggleCollapsed } = useChatChrome();
  return (
    <div className="flex min-h-14 items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-3">
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
      {collapsed ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden text-muted-foreground md:inline-flex"
            onClick={toggleCollapsed}
            aria-label="Open sidebar"
            title="Open sidebar"
          >
            <PanelLeftOpen />
          </Button>
          <Button asChild variant="ghost" size="icon" className="hidden text-muted-foreground md:inline-flex">
            <Link href="/chat" aria-label="New chat" title="New chat">
              <SquarePen />
            </Link>
          </Button>
        </>
      ) : null}
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
    </div>
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
