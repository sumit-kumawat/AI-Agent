"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatTopBar, NewChatButton } from "@/components/chat/chat-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function StartChat({ model }: { model: string }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/conversations", { method: "POST" });
    if (!response.ok) {
      setError("Could not start a chat.");
      setPending(false);
      return;
    }
    const conversation = (await response.json()) as { id: string };
    sessionStorage.setItem(`harbor-draft:${conversation.id}`, trimmed);
    router.push(`/chat/${conversation.id}`);
  }

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar title="Harbor" detail={model} />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h2 className="font-heading text-4xl text-balance">
          Start a conversation
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your message is saved to this account and streamed from the Ollama
          model on this machine.
        </p>
        <div className="mt-6">
          <NewChatButton label="Empty chat" className="w-48" />
        </div>
      </div>
      <form
        className="border-t"
        onSubmit={(event) => {
          event.preventDefault();
          void start(input);
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void start(input);
              }
            }}
            placeholder="Message Harbor"
            rows={1}
            className="max-h-48 min-h-11 resize-none py-3"
          />
          <Button type="submit" className="h-11" disabled={pending || !input.trim()}>
            {pending ? "Starting…" : "Send"}
          </Button>
        </div>
        {error ? (
          <p className="px-4 pb-4 text-center text-sm text-destructive">{error}</p>
        ) : null}
      </form>
    </div>
  );
}
