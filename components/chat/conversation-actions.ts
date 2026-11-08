"use client";

import { usePathname, useRouter } from "next/navigation";
import { useFeedback } from "@/components/feedback";

export async function jsonFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    let message = "Something went wrong. Try again.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Keep the generic message.
    }
    throw new Error(message);
  }
  return (response.status === 204 ? null : await response.json()) as T;
}

export type ConversationRef = { id: string; title: string };

/** Rename, pin, archive and delete with confirmation and error popups. */
export function useConversationActions() {
  const router = useRouter();
  const pathname = usePathname();
  const { confirm, prompt, notify, toast } = useFeedback();

  async function patch(id: string, body: Record<string, unknown>, failure: string, success?: string) {
    try {
      await jsonFetch(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      router.refresh();
      if (success) toast(success);
      return true;
    } catch (error) {
      void notify({ tone: "error", title: failure, description: (error as Error).message });
      return false;
    }
  }

  return {
    async rename(conversation: ConversationRef) {
      const title = await prompt({
        title: "Rename chat",
        label: "Title",
        defaultValue: conversation.title,
        maxLength: 120,
        confirmLabel: "Rename",
      });
      if (!title?.trim() || title.trim() === conversation.title) return;
      await patch(conversation.id, { title: title.trim() }, "Rename failed");
    },
    renameTo(conversation: ConversationRef, title: string) {
      return patch(conversation.id, { title }, "Rename failed");
    },
    setPinned(conversation: ConversationRef, pinned: boolean) {
      return patch(
        conversation.id,
        { pinned },
        pinned ? "Pin failed" : "Unpin failed",
        pinned ? "Chat pinned" : "Chat unpinned",
      );
    },
    async setArchived(conversation: ConversationRef, archived: boolean) {
      const ok = await patch(
        conversation.id,
        { archived },
        archived ? "Archive failed" : "Restore failed",
        archived ? "Chat archived" : "Chat restored",
      );
      if (ok && archived && pathname === `/chat/${conversation.id}`) router.push("/chat");
      return ok;
    },
    async remove(conversation: ConversationRef) {
      const ok = await confirm({
        title: "Delete chat?",
        description: `"${conversation.title}" and all of its messages will be permanently deleted.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return false;
      try {
        await jsonFetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      } catch (error) {
        void notify({ tone: "error", title: "Delete failed", description: (error as Error).message });
        return false;
      }
      if (pathname === `/chat/${conversation.id}`) router.push("/chat");
      router.refresh();
      toast("Chat deleted");
      return true;
    },
  };
}
