"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Archive,
  Boxes,
  CircleHelp,
  Code,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  SquarePen,
  Trash,
} from "lucide-react";
import { Mark } from "@/components/brand";
import { useChatChrome } from "@/components/chat/chat-shell";
import { useConversationActions } from "@/components/chat/conversation-actions";
import { ConzexCredit } from "@/components/conzex-credit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BRAND } from "@/lib/brand";
import type { ConversationListItem } from "@/lib/db/queries";

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

function ProfileMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, admin, openSettings } = useChatChrome();
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-profile-menu
          className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-sidebar-accent"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name || "Signed in"}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-56">
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
            <DropdownMenuItem asChild>
              <Link href="/ide">
                <Code />
                IDE
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: "/" })}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarBody({
  conversations,
  onNavigate,
  onCollapse,
}: {
  conversations: ConversationListItem[];
  onNavigate?: () => void;
  onCollapse?: () => void;
}) {
  const { admin, openSearch } = useChatChrome();
  const pathname = usePathname();
  const navItem = (active: boolean) =>
    `flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm ${
      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/70"
    }`;

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link href="/chat" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <Mark className="size-7 shrink-0 text-primary" />
          <span className="font-heading text-lg">{BRAND.product}</span>
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
        <Link
          href="/chat"
          onClick={onNavigate}
          className={navItem(pathname === "/chat")}
          aria-current={pathname === "/chat" ? "page" : undefined}
        >
          <SquarePen className="size-4" />
          New chat
          <kbd className="ml-auto hidden text-xs text-muted-foreground lg:inline">⇧⌘O</kbd>
        </Link>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openSearch();
          }}
          className={navItem(false)}
        >
          <Search className="size-4" />
          Search chats
          <kbd className="ml-auto hidden text-xs text-muted-foreground lg:inline">⌘K</kbd>
        </button>
        <Link href="/chat/models" onClick={onNavigate} className={navItem(pathname === "/chat/models")}>
          <Boxes className="size-4" />
          {admin ? "Manage models" : "Models"}
        </Link>
      </div>
      <nav aria-label="Conversations" className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        <ConversationList conversations={conversations} onNavigate={onNavigate} />
      </nav>
      <div className="border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <ProfileMenu onNavigate={onNavigate} />
        <ConzexCredit className="mt-1.5 px-2" />
      </div>
    </div>
  );
}
