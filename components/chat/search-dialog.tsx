"use client";

import { Archive, Loader2, MessageSquare, Search, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ConversationListItem, SearchResult } from "@/lib/db/queries";

type Item = { id: string; title: string; snippet: string | null; archived: boolean; updatedAt: number };

function when(updatedAt: number) {
  const days = Math.floor((Date.now() - updatedAt) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        aria-describedby="search-help"
      >
        <DialogTitle className="sr-only">Search chats</DialogTitle>
        <DialogDescription id="search-help" className="sr-only">
          Search the titles and messages of your chats. Use the arrow keys and Enter to open one.
        </DialogDescription>
        {open ? <SearchBody recent={recent} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SearchBody({ recent, onClose }: { recent: ConversationListItem[]; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; items: Item[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((data: { results: SearchResult[] }) => {
          setFailed(false);
          setResults({ query: trimmed, items: data.results });
          setActive(0);
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== "AbortError") setFailed(true);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const searching = trimmed !== "" && results?.query !== trimmed && !failed;
  const items: Item[] = trimmed
    ? (results?.query === trimmed ? results.items : [])
    : recent.slice(0, 8).map((item) => ({ ...item, snippet: null, archived: false }));
  const entries = trimmed ? items : [{ id: "new", title: "New chat", snippet: null, archived: false, updatedAt: 0 }, ...items];

  function open(entry: Item) {
    onClose();
    router.push(entry.id === "new" ? "/chat" : `/chat/${entry.id}`);
  }

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div>
      <div className="flex items-center gap-2 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          maxLength={200}
          placeholder="Search chats…"
          aria-label="Search chats"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, entries.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && entries[active]) {
              event.preventDefault();
              open(entries[active]);
            }
          }}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {searching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      <div ref={list} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-2" data-search-results>
        {!trimmed ? <p className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">Recent</p> : null}
        {failed ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Search failed. Check your connection and try again.</p>
        ) : trimmed && !searching && entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No chats match &ldquo;{trimmed}&rdquo;.</p>
        ) : (
          entries.map((entry, index) => {
            const Icon = entry.id === "new" ? SquarePen : entry.archived ? Archive : MessageSquare;
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={index === active}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => open(entry)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left ${
                  index === active ? "bg-muted" : ""
                }`}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{entry.title}</span>
                  {entry.snippet ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{entry.snippet}</span>
                  ) : null}
                </span>
                {entry.id !== "new" ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {entry.archived ? "Archived · " : ""}
                    {when(entry.updatedAt)}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
