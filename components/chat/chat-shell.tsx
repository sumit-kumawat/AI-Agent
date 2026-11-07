"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Boxes,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Shield,
  SquarePen,
  Trash,
} from "lucide-react";
import { Mark } from "@/components/brand";
import type { ModelOption } from "@/components/chat/model-picker";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ConversationListItem } from "@/lib/db/queries";

type Chrome = {
  openMenu: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  models: ModelOption[];
  defaultModel: string | null;
  admin: boolean;
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

function subscribeDay(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  return () => window.clearInterval(timer);
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const DAY = 24 * 60 * 60 * 1000;

/** Groups newest-first conversations by local date. Null before hydration, so server and client agree. */
function groupByDay(conversations: ConversationListItem[], today: number | null) {
  if (today === null) return [{ label: null, items: conversations }];
  const buckets: { label: string; since: number }[] = [
    { label: "Today", since: today },
    { label: "Yesterday", since: today - DAY },
    { label: "Previous 7 days", since: today - 7 * DAY },
    { label: "Previous 30 days", since: today - 30 * DAY },
    { label: "Older", since: Number.NEGATIVE_INFINITY },
  ];
  const groups = buckets.map((bucket) => ({ label: bucket.label, items: [] as ConversationListItem[] }));
  for (const conversation of conversations) {
    const index = buckets.findIndex((bucket) => conversation.updatedAt >= bucket.since);
    groups[index]!.items.push(conversation);
  }
  return groups.filter((group) => group.items.length > 0);
}

export async function renameConversation(id: string, title: string) {
  const response = await fetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return response.ok;
}

export function NewChatButton({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <Button asChild className="h-9 w-full justify-start">
      <Link href="/chat" onClick={onNavigate} aria-current={pathname === "/chat" ? "page" : undefined}>
        <SquarePen />
        New chat
      </Link>
    </Button>
  );
}

function ConversationItem({
  conversation,
  active,
  onNavigate,
  onError,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onNavigate?: () => void;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  async function save() {
    const title = draft.trim();
    setEditing(false);
    if (!title || title === conversation.title) return;
    onError(null);
    if (await renameConversation(conversation.id, title)) router.refresh();
    else onError("Could not rename that conversation.");
  }

  async function remove() {
    if (!window.confirm(`Delete "${conversation.title}"?`)) return;
    onError(null);
    const response = await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    if (!response.ok) {
      onError("Could not delete that conversation.");
      return;
    }
    if (active) router.push("/chat");
    router.refresh();
  }

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        maxLength={120}
        aria-label="Conversation title"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") {
            setDraft(conversation.title);
            setEditing(false);
          }
        }}
        className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-ring"
      />
    );
  }

  return (
    <div
      className={`group relative flex items-center rounded-lg ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
      }`}
    >
      <Link
        href={`/chat/${conversation.id}`}
        onClick={onNavigate}
        title={conversation.title}
        className="min-w-0 flex-1 truncate py-2.5 pr-9 pl-2.5 text-sm md:py-2"
      >
        {conversation.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            aria-label={`Options for ${conversation.title}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(conversation.title);
              setEditing(true);
            }}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
            <Trash />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ConversationList({
  conversations,
  onNavigate,
}: {
  conversations: ConversationListItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const today = useSyncExternalStore(subscribeDay, startOfToday, () => null);
  const [error, setError] = useState<string | null>(null);

  if (conversations.length === 0) {
    return <p className="px-2.5 text-sm text-muted-foreground">Your chats will show up here.</p>;
  }

  return (
    <div className="space-y-4">
      {groupByDay(conversations, today).map((group) => (
        <section key={group.label ?? "all"} className="space-y-0.5">
          {group.label ? (
            <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h2>
          ) : null}
          {group.items.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              active={pathname === `/chat/${conversation.id}`}
              onNavigate={onNavigate}
              onError={setError}
            />
          ))}
        </section>
      ))}
      {error ? <p className="px-2.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SidebarBody({
  conversations,
  user,
  onNavigate,
  onCollapse,
}: {
  conversations: ConversationListItem[];
  user: { name?: string | null; email?: string | null };
  onNavigate?: () => void;
  onCollapse?: () => void;
}) {
  const { admin } = useChatChrome();
  const pathname = usePathname();
  const navLink = (active: boolean) =>
    `flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm ${
      active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link href="/chat" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <Mark className="size-7 shrink-0 text-primary" />
          <span className="font-heading text-lg">Harbor</span>
        </Link>
        {onCollapse ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onCollapse}
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <PanelLeftClose />
          </Button>
        ) : null}
      </div>
      <div className="space-y-0.5 px-3">
        <NewChatButton onNavigate={onNavigate} />
        <div className="pt-1" />
        <Link href="/chat/models" onClick={onNavigate} className={navLink(pathname === "/chat/models")}>
          <Boxes className="size-4" />
          {admin ? "Manage models" : "Models"}
        </Link>
        {admin ? (
          <Link href="/admin" className={navLink(false)}>
            <Shield className="size-4" />
            Admin panel
          </Link>
        ) : null}
      </div>
      <nav aria-label="Conversations" className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        <ConversationList conversations={conversations} onNavigate={onNavigate} />
      </nav>
      <div className="flex items-center gap-2 border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name || "Signed in"}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <ThemeToggle />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut />
        </Button>
      </div>
    </div>
  );
}

export function ChatShell({
  children,
  conversations,
  user,
  models,
  defaultModel,
  admin,
  ollamaMessage,
}: {
  children: ReactNode;
  conversations: ConversationListItem[];
  user: { name?: string | null; email?: string | null };
  models: ModelOption[];
  defaultModel: string | null;
  admin: boolean;
  ollamaMessage: string | null;
}) {
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const chrome = useMemo(
    () => ({
      openMenu: () => setOpen(true),
      collapsed,
      toggleCollapsed: () => writeCollapsed(!collapsed),
      models,
      defaultModel,
      admin,
    }),
    [collapsed, models, defaultModel, admin],
  );

  return (
    <ChatChromeContext.Provider value={chrome}>
      <div className="fixed inset-0 flex overflow-hidden bg-background">
        {collapsed ? null : (
          <aside className="hidden w-64 shrink-0 border-r md:flex lg:w-72">
            <SidebarBody conversations={conversations} user={user} onCollapse={() => writeCollapsed(true)} />
          </aside>
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-80 p-0 sm:max-w-80">
            <SheetHeader className="sr-only">
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            <SidebarBody conversations={conversations} user={user} onNavigate={() => setOpen(false)} />
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
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden text-muted-foreground md:inline-flex"
          >
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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  async function save() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === title) return;
    const ok = await renameConversation(id, next);
    setError(!ok);
    if (ok) router.refresh();
  }

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        maxLength={120}
        aria-label="Conversation title"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
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
      {error ? <span className="text-xs font-normal text-destructive">Rename failed</span> : null}
    </button>
  );
}
