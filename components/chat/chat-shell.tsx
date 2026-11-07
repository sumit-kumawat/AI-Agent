"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { LogOut, Menu, Plus, Trash } from "lucide-react";
import { Mark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ConversationListItem } from "@/lib/db/queries";

type Chrome = { openMenu: () => void };

const ChatChromeContext = createContext<Chrome | null>(null);

export function useChatChrome() {
  const value = useContext(ChatChromeContext);
  if (!value) {
    throw new Error("Chat chrome is only available inside the chat layout.");
  }
  return value;
}

function formatWhen(timestamp: number) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function NewChatButton({
  className,
  label = "New chat",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/conversations", { method: "POST" });
      if (!response.ok) {
        setError("Could not start a chat.");
        return;
      }
      const conversation = (await response.json()) as { id: string };
      router.push(`/chat/${conversation.id}`);
    } catch {
      setError("Could not start a chat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        className="h-9 w-full justify-start"
        onClick={create}
        disabled={pending}
      >
        <Plus />
        {pending ? "Starting…" : label}
      </Button>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    const response = await fetch(`/api/conversations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("Could not delete that conversation.");
      return;
    }
    if (pathname === `/chat/${id}`) router.push("/chat");
    router.refresh();
    onNavigate?.();
  }

  if (conversations.length === 0) {
    return (
      <p className="px-2 text-sm text-muted-foreground">
        Saved chats will show up here.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conversation) => {
        const active = pathname === `/chat/${conversation.id}`;
        return (
          <div
            key={conversation.id}
            className={`group flex items-center gap-1 rounded-lg pr-1 ${
              active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            <Link
              href={`/chat/${conversation.id}`}
              onClick={onNavigate}
              className="min-w-0 flex-1 px-2.5 py-2"
            >
              <span className="block truncate text-sm">{conversation.title}</span>
              <span
                className="block text-xs text-muted-foreground"
                suppressHydrationWarning
              >
                {formatWhen(conversation.updatedAt)}
              </span>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="opacity-70 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              aria-label={`Delete ${conversation.title}`}
              onClick={() => remove(conversation.id)}
            >
              <Trash />
            </Button>
          </div>
        );
      })}
      {error ? <p className="px-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SidebarBody({
  conversations,
  user,
  model,
  onNavigate,
}: {
  conversations: ConversationListItem[];
  user: { name?: string | null; email?: string | null };
  model: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <Mark className="size-7 text-primary" />
        <div>
          <p className="text-sm font-medium">Harbor</p>
          <p className="text-xs text-muted-foreground">{model}</p>
        </div>
      </div>
      <div className="px-3">
        <NewChatButton />
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2">
        <ConversationList conversations={conversations} onNavigate={onNavigate} />
      </div>
      <div className="border-t p-3">
        <p className="truncate text-sm font-medium">
          {user.name || "Signed in"}
        </p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        <Button
          type="button"
          variant="ghost"
          className="mt-2 h-8 w-full justify-start px-2"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function ChatShell({
  children,
  conversations,
  user,
  model,
  ollamaMessage,
}: {
  children: ReactNode;
  conversations: ConversationListItem[];
  user: { name?: string | null; email?: string | null };
  model: string;
  ollamaMessage: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <ChatChromeContext.Provider value={{ openMenu: () => setOpen(true) }}>
      <div className="fixed inset-0 flex overflow-hidden bg-background">
        <aside className="hidden w-72 shrink-0 border-r md:flex">
          <SidebarBody
            conversations={conversations}
            user={user}
            model={model}
          />
        </aside>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-80 p-0 sm:max-w-80">
            <SheetHeader className="sr-only">
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            <SidebarBody
              conversations={conversations}
              user={user}
              model={model}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          {ollamaMessage ? (
            <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950">
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
}: {
  title: string;
  detail?: string;
}) {
  const { openMenu } = useChatChrome();
  return (
    <div className="flex items-center gap-2 border-b px-3 py-3 md:px-5">
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
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium">{title}</h1>
        {detail ? (
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}
