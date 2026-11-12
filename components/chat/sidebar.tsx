"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Archive,
  CircleHelp,
  Code,
  Gauge,
  Lock,
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
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { LogOutButton, useLogOut } from "@/components/auth/log-out";
import { useChatChrome } from "@/components/chat/chat-shell";
import { Kbd } from "@/components/shortcut";
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
  const logOut = useLogOut();
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
        <DropdownMenuItem onSelect={() => void logOut()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type NavEntry = {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  href?: string;
  onSelect?: () => void;
  active?: boolean;
  locked?: boolean;
};

export function SidebarBody({
  conversations,
  onNavigate,
  collapsed = false,
  onToggle,
}: {
  conversations: ConversationListItem[];
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const { admin, usage, openSearch } = useChatChrome();
  const pathname = usePathname();
  const inAdmin = admin && pathname.startsWith("/admin");
  const ideLocked = !admin && usage.locked.ide !== undefined;

  const entries: NavEntry[] = inAdmin
    ? [{ label: "Back to chat", icon: SquarePen, href: "/chat", active: false }]
    : [
        { label: "New chat", icon: SquarePen, shortcut: "mod+shift+o", href: "/chat", active: pathname === "/chat" },
        { label: "Search chats", icon: Search, shortcut: "mod+k", onSelect: openSearch },
        {
          label: "Studio",
          icon: WandSparkles,
          href: "/studio",
          active: pathname.startsWith("/studio"),
        },
        {
          label: "IDE",
          icon: Code,
          href: ideLocked ? `/plans?highlight=${usage.locked.ide?.requiredPlan?.id ?? ""}` : "/ide",
          active: pathname.startsWith("/ide"),
          locked: ideLocked,
        },
        { label: "Usage", icon: Gauge, href: "/usage", active: pathname === "/usage" },
        { label: "Plans", icon: Sparkles, href: "/plans", active: pathname === "/plans" },
        ...(admin ? [{ label: "Admin", icon: Shield, href: "/admin", active: false }] : []),
      ];

  const item = (active = false) =>
    `flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap ${
      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/70"
    }`;
  const labelClass = `min-w-0 flex-1 truncate text-left transition-opacity duration-150 ${collapsed ? "opacity-0" : "opacity-100"}`;

  function renderEntry(entry: NavEntry) {
    const content = (
      <>
        <entry.icon className="size-4 shrink-0" />
        <span className={labelClass} aria-hidden={collapsed}>
          {entry.label}
        </span>
        {entry.locked && !collapsed ? <Lock className="size-3.5 text-muted-foreground" aria-label="Not in your plan" /> : null}
        {entry.shortcut && !collapsed ? <Kbd combo={entry.shortcut} className="hidden lg:inline" /> : null}
      </>
    );
    return (
      <RailTip key={entry.label + (entry.href ?? "")} label={entry.label} show={collapsed}>
        {entry.href ? (
          <Link
            href={entry.href}
            onClick={onNavigate}
            aria-label={collapsed ? entry.label : undefined}
            aria-current={entry.active ? "page" : undefined}
            className={item(Boolean(entry.active))}
          >
            {content}
          </Link>
        ) : (
          <button
            type="button"
            aria-label={collapsed ? entry.label : undefined}
            onClick={() => entry.onSelect?.()}
            aria-pressed={entry.active}
            className={item(Boolean(entry.active))}
          >
            {content}
          </button>
        )}
      </RailTip>
    );
  }

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
              title="Collapse or expand the sidebar"
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </RailTip>
        ) : null}
      </div>

      <div className="space-y-0.5 px-2">{entries.map(renderEntry)}</div>

      <nav
        aria-label={inAdmin ? "Admin sections" : "Conversations"}
        aria-hidden={collapsed}
        inert={collapsed || undefined}
        className={`mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 transition-opacity duration-150 ${
          collapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {inAdmin ? <AdminNav onNavigate={onNavigate} /> : <ConversationList conversations={conversations} onNavigate={onNavigate} />}
      </nav>

      <div className="shrink-0 border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <ProfileMenu onNavigate={onNavigate} collapsed={collapsed} />
          </div>
          {collapsed ? null : <LogOutButton className="shrink-0 text-muted-foreground" />}
        </div>
      </div>
    </div>
  );
}
