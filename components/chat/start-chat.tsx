"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { ChatTopBar, NewChatButton, useChatChrome } from "@/components/chat/chat-shell";
import {
  ModelPicker,
  pickModel,
  usePreferredModel,
  useWarmModel,
} from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function StartChat() {
  const router = useRouter();
  const { models, defaultModel } = useChatChrome();
  const preferred = usePreferredModel();
  const [picked, setPicked] = useState<string | null>(null);
  const model = pickModel(models, picked, preferred, defaultModel);
  useWarmModel(model);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (!response.ok) throw new Error();
      const conversation = (await response.json()) as { id: string };
      sessionStorage.setItem(`harbor-draft:${conversation.id}`, trimmed);
      router.push(`/chat/${conversation.id}`);
    } catch {
      setError("Could not start a chat. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar
        title="Harbor"
        actions={<ModelPicker models={models} value={model} onChange={setPicked} />}
      />
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center">
        <h2 className="font-heading text-3xl text-balance sm:text-4xl">
          Start a conversation
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your message is saved to this account and streamed from{" "}
          {model ? <span className="font-medium text-foreground">{model}</span> : "a local model"}{" "}
          running on this server.
        </p>
        <div className="mt-6">
          <NewChatButton label="Empty chat" className="w-48" />
        </div>
      </div>
      <form
        className="border-t bg-background"
        onSubmit={(event) => {
          event.preventDefault();
          void start(input);
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-4">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void start(input);
              }
            }}
            placeholder="Message Harbor"
            aria-label="Message"
            enterKeyHint="send"
            rows={1}
            className="max-h-40 min-h-11 resize-none py-3 sm:max-h-48"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="size-11 shrink-0"
            disabled={pending || !input.trim() || !model}
            aria-label={pending ? "Starting chat" : "Send message"}
          >
            <ArrowUp />
          </Button>
        </div>
        {error ? (
          <p className="px-4 pb-4 text-center text-sm text-destructive">{error}</p>
        ) : null}
      </form>
    </div>
  );
}
