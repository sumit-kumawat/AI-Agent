"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Archive,
  Boxes,
  CircleHelp,
  Code,
  Gauge,
  Loader2,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  Trash,
  X,
  type LucideIcon,
} from "lucide-react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { useConversationActions } from "@/components/chat/conversation-actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConversationListItem, SearchResult } from "@/lib/db/queries";

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
  if (today === null) return [{ label: "Chats", items: conversations }];
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

function ConversationItem({
  conversation,
  active,
  onNavigate,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const actions = useConversationActions();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const input = useRef<HTMLInputElement>(null);
  const pinned = conversation.pinnedAt !== null;

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function save() {
    const title = draft.replace(/\s+/g, " ").trim();
    setEditing(false);
    if (title && title !== conversation.title) void actions.renameTo(conversation, title);
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
      data-conversation={conversation.id}
      className={`group relative flex items-center rounded-lg ${
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/70"
      }`}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <Link
        href={`/chat/${conversation.id}`}
        onClick={onNavigate}
        title={conversation.title}
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 truncate py-2.5 pr-9 pl-2.5 text-sm md:py-2"
      >
        {conversation.title}
      </Link>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => void actions.setPinned(conversation, !pinned)}>
            {pinned ? <PinOff /> : <Pin />}
            {pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setDraft(conversation.title);
              setEditing(true);
            }}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void actions.setArchived(conversation, true)}>
            <Archive />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void actions.remove(conversation)}>
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
  if (conversations.length === 0) {
    return <p className="px-2.5 text-sm text-muted-foreground">Your chats will show up here.</p>;
  }
  const pinned = conversations
    .filter((conversation) => conversation.pinnedAt !== null)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  const rest = conversations.filter((conversation) => conversation.pinnedAt === null);
  const groups = [
    ...(pinned.length ? [{ label: "Pinned", items: pinned }] : []),
    ...groupByDay(rest, today),
  ];

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.label} className="space-y-0.5" aria-label={group.label}>
          <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h2>
          {group.items.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              active={pathname === `/chat/${conversation.id}`}
              onNavigate={onNavigate}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/** Shows `label` beside the icon rail when the sidebar is collapsed. */
function RailTip({ label, show, children }: { label: string; show: boolean; children: ReactNode }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ProfileMenu({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed: boolean }) {
  const { user, admin, openSettings } = useChatChrome();
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <RailTip label={user.name || user.email} show={collapsed}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-profile-menu
            aria-label="Account menu"
            className="flex h-11 w-full items-center gap-3 rounded-lg px-1.5 text-left hover:bg-sidebar-accent"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {initial}
            </span>
            <span className={`min-w-0 flex-1 transition-opacity ${collapsed ? "opacity-0" : "opacity-100"}`} aria-hidden={collapsed}>
              <span className="block truncate text-sm font-medium">{user.name || "Signed in"}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
      </RailTip>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} className="min-w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { onNavigate?.(); openSettings("personalization"); }}>
          <SlidersHorizontal />
          Personalization
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { onNavigate?.(); openSettings("general"); }}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { onNavigate?.(); openSettings("data"); }}>
          <Archive />
          Archived chats
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help" onClick={onNavigate}>
            <CircleHelp />
            Help
          </Link>
        </DropdownMenuItem>
        {admin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Shield />
                Admin panel
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: "/login" })}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline search over chat titles and messages; results replace the chat list while it is open. */
function ChatSearch({ onClose, onNavigate }: { onClose: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; items: SearchResult[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((data: { results: SearchResult[] }) => {
          setFailed(null);
          setResults({ query: trimmed, items: data.results });
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== "AbortError") setFailed(trimmed);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const current = results?.query === trimmed ? results.items : null;
  return (
    <div className="space-y-2" data-chat-search>
      <div className="flex items-center gap-1 rounded-lg border bg-background px-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
          placeholder="Search chats"
          aria-label="Search chats"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close search">
          <X />
        </Button>
      </div>
      {!trimmed ? (
        <p className="px-2.5 text-sm text-muted-foreground">Search titles and messages.</p>
      ) : failed === trimmed ? (
        <p className="px-2.5 text-sm text-destructive">Search failed. Try again.</p>
      ) : current === null ? (
        <p className="flex items-center gap-2 px-2.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </p>
      ) : current.length === 0 ? (
        <p className="px-2.5 text-sm text-muted-foreground">No chats match.</p>
      ) : (
        <ul className="space-y-0.5" aria-label="Search results">
          {current.map((result) => (
            <li key={result.id}>
              <Link
                href={`/chat/${result.id}`}
                onClick={onNavigate}
                aria-current={pathname === `/chat/${result.id}` ? "page" : undefined}
                className={`block rounded-lg px-2.5 py-1.5 text-sm hover:bg-sidebar-accent/70 ${
                  pathname === `/chat/${result.id}` ? "bg-sidebar-accent" : ""
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{result.title}</span>
                  {result.archived ? <Archive className="size-3.5 shrink-0 text-muted-foreground" aria-label="Archived" /> : null}
                </span>
                {result.snippet ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">{result.snippet}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type NavEntry = {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  href?: string;
  onSelect?: () => void;
  active?: boolean;
};

export function SidebarBody({
  conversations,
  onNavigate,
  collapsed = false,
  onToggle,
}: {
  conversations: ConversationListItem[];
  onNavigate?: () => void;
  /** Icon rail: icons only, labels in tooltips. */
  collapsed?: boolean;
  /** Present on desktop, where the sidebar can collapse to the rail. */
  onToggle?: () => void;
}) {
  const { admin, usage } = useChatChrome();
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const openSearch = () => {
    if (collapsed) onToggle?.();
    setSearching(true);
  };
  const entries: NavEntry[] = [
    { label: "New chat", icon: SquarePen, shortcut: "⇧⌘O", href: "/chat", active: pathname === "/chat" },
    { label: "Search chats", icon: Search, onSelect: openSearch, active: searching && !collapsed },
    {
      label: admin ? "Manage models" : "Models",
      icon: Boxes,
      href: "/chat/models",
      active: pathname === "/chat/models",
    },
    ...(!admin || usage.locked.ide ? [] : [{ label: "IDE", icon: Code, href: "/ide", active: pathname.startsWith("/ide") }]),
    { label: "Usage", icon: Gauge, href: "/usage", active: pathname === "/usage" },
    { label: "Plans", icon: Sparkles, href: "/plans", active: pathname === "/plans" },
  ];
  const item = (active = false) =>
    `flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap ${
      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/70"
    }`;
  const label = `min-w-0 flex-1 truncate text-left transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center px-2 pt-[env(safe-area-inset-top)]">
        {onToggle ? (
          <RailTip label={collapsed ? "Open sidebar" : "Close sidebar"} show>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={onToggle}
              aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </RailTip>
        ) : null}
      </div>
      <div className="space-y-0.5 px-2">
        {entries.map((entry) => {
          const content = (
            <>
              <entry.icon className="size-4 shrink-0" />
              <span className={label} aria-hidden={collapsed}>
                {entry.label}
              </span>
              {entry.shortcut && !collapsed ? (
                <kbd className="hidden text-xs text-muted-foreground lg:inline">{entry.shortcut}</kbd>
              ) : null}
            </>
          );
          return (
            <RailTip key={entry.label} label={entry.label} show={collapsed}>
              {entry.href ? (
                <Link
                  href={entry.href}
                  onClick={onNavigate}
                  aria-label={collapsed ? entry.label : undefined}
                  aria-current={entry.active ? "page" : undefined}
                  className={item(entry.active)}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  aria-label={collapsed ? entry.label : undefined}
                  onClick={() => entry.onSelect?.()}
                  aria-pressed={entry.active}
                  className={item(entry.active)}
                >
                  {content}
                </button>
              )}
            </RailTip>
          );
        })}
      </div>
      <nav
        aria-label="Conversations"
        aria-hidden={collapsed}
        inert={collapsed}
        className={`mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 transition-opacity duration-150 ${
          collapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {searching && !collapsed ? (
          <ChatSearch onClose={() => setSearching(false)} onNavigate={onNavigate} />
        ) : (
          <ConversationList conversations={conversations} onNavigate={onNavigate} />
        )}
      </nav>
      <div className="shrink-0 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <ProfileMenu onNavigate={onNavigate} collapsed={collapsed} />
      </div>
    </div>
  );
}
