"use client";

import { Archive, Loader2, MessageSquare, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Kbd } from "@/components/shortcut";
import type { ConversationListItem, SearchResult } from "@/lib/db/queries";

type Item = { id: string; title: string; snippet?: string | null; archived?: boolean };

/**
 * Search over the user's chats, opened with Cmd/Ctrl+K or from the sidebar.
 * A compact panel over the current page: no backdrop, nothing behind it is
 * hidden or collapsed, and closing returns focus to where it was.
 */
export function SearchDialog({
  open,
  onOpenChange,
  recent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recent: ConversationListItem[];
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-search-dialog
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
          onInteractOutside={() => onOpenChange(false)}
          className="fixed top-16 left-1/2 z-50 flex max-h-[min(28rem,calc(100dvh-6rem))] w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Search chats</DialogPrimitive.Title>
          {open ? <SearchBody recent={recent} onClose={() => onOpenChange(false)} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SearchBody({ recent, onClose }: { recent: ConversationListItem[]; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; items: SearchResult[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((data: { results: SearchResult[] }) => {
          setFailed(null);
          setActive(0);
          setResults({ query: trimmed, items: data.results });
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== "AbortError") setFailed(trimmed);
        });
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const current: Item[] | null = !trimmed ? recent.slice(0, 8) : results?.query === trimmed ? results.items : null;

  function open(item: Item) {
    onClose();
    router.push(`/chat/${item.id}`);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!current?.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (active + (event.key === "ArrowDown" ? 1 : -1) + current.length) % current.length;
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(current[Math.min(active, current.length - 1)]!);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search chats by title or message"
          aria-label="Search chats"
          aria-controls="search-results"
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        <Kbd combo="mod+k" className="hidden sm:inline" />
        <DialogPrimitive.Close
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close search"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {trimmed && failed === trimmed ? (
          <p className="px-3 py-6 text-center text-sm text-destructive">Search failed. Try again.</p>
        ) : current === null ? (
          <p className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </p>
        ) : current.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{trimmed ? "No chats match." : "No chats yet."}</p>
        ) : (
          <>
            <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">{trimmed ? "Results" : "Recent chats"}</p>
            <ul id="search-results" ref={list} role="listbox" aria-label="Search results">
              {current.map((item, index) => (
                <li key={item.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onClick={() => open(item)}
                    onMouseMove={() => setActive(index)}
                    data-search-result={item.id}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${index === active ? "bg-accent" : ""}`}
                  >
                    <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {item.archived ? <Archive className="size-3.5 shrink-0 text-muted-foreground" aria-label="Archived" /> : null}
                      </span>
                      {item.snippet ? <span className="line-clamp-2 text-xs text-muted-foreground">{item.snippet}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
