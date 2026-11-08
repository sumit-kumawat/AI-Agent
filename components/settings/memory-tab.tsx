"use client";

import { Pencil, Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { useChatChrome } from "@/components/chat/chat-shell";
import { jsonFetch } from "@/components/chat/conversation-actions";
import { useFeedback } from "@/components/feedback";
import { Row, Toggle } from "@/components/settings/controls";
import { Button } from "@/components/ui/button";
import type { Memory } from "@/lib/memory";

export function MemoryTab() {
  const { prefs, updatePrefs } = useChatChrome();
  const { confirm, prompt, notify, toast } = useFeedback();
  const [data, setData] = useState<{ memories: Memory[]; limit: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    jsonFetch<{ memories: Memory[]; limit: number }>("/api/memories")
      .then((result) => {
        if (!cancelled) {
          setData(result);
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

  const reload = () => setVersion((value) => value + 1);

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast(success);
      reload();
    } catch (error) {
      void notify({ tone: "error", title: "That did not work", description: (error as Error).message });
    }
  }

  async function add() {
    const content = await prompt({
      title: "Add a memory",
      label: "Something to remember",
      placeholder: "e.g. I work in IST and prefer concise answers",
      maxLength: 500,
      confirmLabel: "Save",
    });
    if (!content?.trim()) return;
    await run(
      () => jsonFetch("/api/memories", { method: "POST", body: JSON.stringify({ content }) }),
      "Memory saved",
    );
  }

  async function edit(memory: Memory) {
    const content = await prompt({
      title: "Edit memory",
      label: "Memory",
      defaultValue: memory.content,
      maxLength: 500,
      confirmLabel: "Save",
    });
    if (!content?.trim() || content.trim() === memory.content) return;
    await run(
      () => jsonFetch(`/api/memories/${memory.id}`, { method: "PATCH", body: JSON.stringify({ content }) }),
      "Memory updated",
    );
  }

  async function remove(memory: Memory) {
    await run(() => jsonFetch(`/api/memories/${memory.id}`, { method: "DELETE" }), "Memory deleted");
  }

  async function clearAll() {
    const ok = await confirm({
      title: "Delete all memories?",
      description: "Every saved memory will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete all",
      destructive: true,
    });
    if (ok) await run(() => jsonFetch("/api/memories", { method: "DELETE" }), "All memories deleted");
  }

  return (
    <div>
      <Row
        label="Reference saved memories"
        description="Saved memories are added to new replies. Temporary chats never use them."
        htmlFor="settings-memory"
      >
        <Toggle
          id="settings-memory"
          label="Reference saved memories"
          checked={prefs.memoryEnabled}
          onChange={(memoryEnabled) => void updatePrefs({ memoryEnabled })}
        />
      </Row>
      <Row
        label="Reference chat history"
        description="Lets replies see the titles of your recent chats for context."
        htmlFor="settings-history"
      >
        <Toggle
          id="settings-history"
          label="Reference chat history"
          checked={prefs.referenceHistory}
          onChange={(referenceHistory) => void updatePrefs({ referenceHistory })}
        />
      </Row>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Saved memories</h3>
          <p className="text-xs text-muted-foreground">
            Say &ldquo;Remember that…&rdquo; in a chat, or add one here.
            {data ? ` ${data.memories.length} of ${data.limit} used.` : ""}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void add()}>
          <Plus />
          Add
        </Button>
      </div>

      <ul className="mt-3 divide-y rounded-xl border" data-memory-list>
        {failed ? (
          <li className="p-4 text-sm text-muted-foreground">
            Could not load memories.{" "}
            <button type="button" className="underline" onClick={reload}>
              Try again
            </button>
          </li>
        ) : !data ? (
          <li className="p-4 text-sm text-muted-foreground">Loading…</li>
        ) : data.memories.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No memories yet.</li>
        ) : (
          data.memories.map((memory) => (
            <li key={memory.id} className="group flex items-start gap-2 px-3 py-2.5" data-memory={memory.id}>
              <p className="min-w-0 flex-1 text-sm leading-6 break-words">{memory.content}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Edit memory"
                className="text-muted-foreground"
                onClick={() => void edit(memory)}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Delete memory"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => void remove(memory)}
              >
                <Trash />
              </Button>
            </li>
          ))
        )}
      </ul>
      {data && data.memories.length > 0 ? (
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void clearAll()}>
            Delete all memories
          </Button>
        </div>
      ) : null}
    </div>
  );
}
