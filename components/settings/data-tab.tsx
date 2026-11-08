"use client";

import { ArchiveRestore, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { jsonFetch } from "@/components/chat/conversation-actions";
import { useFeedback } from "@/components/feedback";
import { Row } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";

type Archived = { id: string; title: string; archivedAt: number | null; updatedAt: number };

export function DataTab() {
  const router = useRouter();
  const { confirm, notify, toast } = useFeedback();
  const [archived, setArchived] = useState<Archived[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    jsonFetch<{ conversations: Archived[] }>("/api/conversations?archived=1")
      .then((result) => {
        if (!cancelled) {
          setArchived(result.conversations);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast(success);
      setVersion((value) => value + 1);
      router.refresh();
    } catch (error) {
      void notify({ tone: "error", title: "That did not work", description: (error as Error).message });
    }
  }

  const bulk = (action: string) =>
    jsonFetch("/api/conversations/bulk", { method: "POST", body: JSON.stringify({ action }) });

  async function archiveAll() {
    const ok = await confirm({
      title: "Archive all chats?",
      description: "Every chat moves out of the sidebar. You can restore them here at any time.",
      confirmLabel: "Archive all",
    });
    if (ok) await run(() => bulk("archive-all"), "All chats archived");
  }

  async function deleteAll() {
    const ok = await confirm({
      title: "Delete all chats?",
      description: "Every chat, including archived ones, will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete all",
      destructive: true,
    });
    if (ok) {
      await run(() => bulk("delete-all"), "All chats deleted");
      router.push("/chat");
    }
  }

  return (
    <div>
      <Row label="Export data" description="Download your profile, preferences, memories and chats as JSON.">
        <Button asChild variant="outline" size="sm">
          <a href="/api/account/export" download data-export>
            Export
          </a>
        </Button>
      </Row>
      <Row label="Archive all chats">
        <Button type="button" variant="outline" size="sm" onClick={() => void archiveAll()}>
          Archive all
        </Button>
      </Row>
      <Row label="Delete all chats" description="Permanently removes every chat.">
        <Button type="button" variant="destructive" size="sm" onClick={() => void deleteAll()}>
          Delete all
        </Button>
      </Row>
      <Row label="Temporary chats" description="Not saved to history or memory, and removed after 24 hours.">
        <Button asChild variant="outline" size="sm">
          <Link href="/chat?temporary=1">Start one</Link>
        </Button>
      </Row>

      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-sm font-medium">Archived chats</h3>
        {archived && archived.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void run(() => bulk("restore-all"), "All chats restored")}
          >
            Restore all
          </Button>
        ) : null}
      </div>
      <ul className="mt-2 divide-y rounded-xl border" data-archived-list>
        {failed ? (
          <li className="p-4 text-sm text-muted-foreground">Could not load archived chats.</li>
        ) : !archived ? (
          <li className="p-4 text-sm text-muted-foreground">Loading…</li>
        ) : archived.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No archived chats.</li>
        ) : (
          archived.map((conversation) => (
            <li key={conversation.id} className="flex items-center gap-2 px-3 py-2" data-archived={conversation.id}>
              <Link href={`/chat/${conversation.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {conversation.title}
              </Link>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {new Date(conversation.archivedAt ?? conversation.updatedAt).toLocaleDateString()}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Restore ${conversation.title}`}
                title="Restore"
                onClick={() =>
                  void run(
                    () =>
                      jsonFetch(`/api/conversations/${conversation.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ archived: false }),
                      }),
                    "Chat restored",
                  )
                }
              >
                <ArchiveRestore />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${conversation.title}`}
                title="Delete"
                className="hover:text-destructive"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Delete chat?",
                    description: `"${conversation.title}" will be permanently deleted.`,
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (ok) {
                    await run(
                      () => jsonFetch(`/api/conversations/${conversation.id}`, { method: "DELETE" }),
                      "Chat deleted",
                    );
                  }
                }}
              >
                <Trash />
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
