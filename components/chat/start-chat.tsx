"use client";

import { Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatTopBar, useChatChrome } from "@/components/chat/chat-shell";
import { Composer } from "@/components/chat/composer";
import { jsonFetch } from "@/components/chat/conversation-actions";
import { pickModel, usePreferredModel, useWarmModel } from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Explain how SQLite WAL mode works",
  "Write a TypeScript function that retries fetch",
  "Draft a short changelog for a chat app",
  "Compare REST and GraphQL in a table",
];

export function Greeting({ onPick, temporary = false }: { onPick: (text: string) => void; temporary?: boolean }) {
  const { prefs, user } = useChatChrome();
  const name = prefs.nickname || user.name.split(" ")[0];
  return (
    <div className="flex flex-col items-center px-2 text-center">
      {temporary ? (
        <>
          <h2 className="font-heading text-3xl text-balance sm:text-4xl">Temporary chat</h2>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            This chat won&rsquo;t appear in your history, won&rsquo;t use or update memory, and is deleted after 24
            hours.
          </p>
        </>
      ) : (
        <h2 className="font-heading text-3xl text-balance sm:text-4xl">
          {name ? `What can I help with, ${name}?` : "What can I help with?"}
        </h2>
      )}
      <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-2xl border px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
            onClick={() => onPick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A blank chat. The conversation is created when the first message is sent. */
export function StartChat({ temporary }: { temporary: boolean }) {
  const router = useRouter();
  const { models, defaultModel, prefs } = useChatChrome();
  const preferred = usePreferredModel();
  const [picked, setPicked] = useState<string | null>(null);
  const model = pickModel(models, picked, preferred, defaultModel);
  useWarmModel(model);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending || !model) return;
    setPending(true);
    setError(null);
    try {
      const conversation = await jsonFetch<{ id: string }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ model, temporary }),
      });
      sessionStorage.setItem(`harbor-draft:${conversation.id}`, trimmed);
      router.push(`/chat/${conversation.id}`);
      router.refresh();
    } catch {
      setError("Could not start a chat. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar
        title={temporary ? "Temporary chat" : "New chat"}
        actions={
          <Button
            type="button"
            variant={temporary ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={temporary}
            data-temporary-toggle
            onClick={() => router.replace(temporary ? "/chat" : "/chat?temporary=1")}
            title={temporary ? "Turn off temporary chat" : "Turn on temporary chat"}
          >
            <Timer />
            <span className="hidden sm:inline">Temporary</span>
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:justify-center">
        <div className="flex flex-1 items-center justify-center py-6 md:mb-8 md:flex-none">
          <Greeting onPick={(text) => void start(text)} temporary={temporary} />
        </div>
        <div className="md:pb-[12vh]">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={(text) => void start(text)}
            pending={pending}
            models={models}
            model={model}
            onModelChange={setPicked}
            error={error}
            sendWithEnter={prefs.sendWithEnter}
            note={temporary ? "Temporary chat: not saved to history or memory." : undefined}
          />
        </div>
      </div>
    </div>
  );
}
