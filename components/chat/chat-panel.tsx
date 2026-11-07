"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatTopBar, useChatChrome } from "@/components/chat/chat-shell";
import { Markdown } from "@/components/chat/markdown";
import {
  ModelPicker,
  pickModel,
  usePreferredModel,
  useWarmModel,
} from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { textFromParts } from "@/lib/text";

const SUGGESTIONS = [
  "Explain how SQLite WAL mode works",
  "Draft a short changelog for a chat app",
  "Write a TypeScript function that retries fetch",
];

export function ChatPanel({
  conversationId,
  title,
  conversationModel,
  initialMessages,
}: {
  conversationId: string;
  title: string;
  conversationModel: string | null;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const { models, defaultModel } = useChatChrome();
  const preferred = usePreferredModel();
  const [picked, setPicked] = useState<string | null>(null);
  const model = pickModel(models, picked, conversationModel, preferred, defaultModel);
  useWarmModel(model);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { conversationId },
        fetch: async (input, init) => {
          const response = await globalThis.fetch(input, init);
          if (!response.ok) {
            let message = "The model did not respond.";
            try {
              const data = (await response.json()) as { error?: string };
              if (data.error) message = data.error;
            } catch {
              message = "The model did not respond.";
            }
            throw new Error(message);
          }
          return response;
        },
      }),
    [conversationId],
  );
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      router.refresh();
    },
  });
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const sentDraft = useRef(false);
  const busy = status === "submitted" || status === "streaming";
  const requestBody = model ? { model } : {};

  useEffect(() => {
    const node = scroller.current;
    if (!node || !pinned.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    if (sentDraft.current) return;
    const key = `harbor-draft:${conversationId}`;
    const draft = sessionStorage.getItem(key);
    if (!draft) return;
    const timer = window.setTimeout(() => {
      if (sentDraft.current) return;
      sentDraft.current = true;
      sessionStorage.removeItem(key);
      void sendMessage({ text: draft });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, sendMessage]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    pinned.current = true;
    void sendMessage({ text: trimmed }, { body: requestBody });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar
        title={title}
        actions={
          <ModelPicker
            models={models}
            value={model}
            onChange={setPicked}
            disabled={busy}
          />
        }
      />
      <div
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          pinned.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-5 sm:px-4 sm:py-6">
          {messages.length === 0 ? (
            <div className="py-10 sm:py-16">
              <h2 className="font-heading text-3xl sm:text-4xl">
                What should we work on?
              </h2>
              <div className="mt-6 flex flex-col gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-xl border px-4 py-3 text-left text-sm hover:bg-muted active:bg-muted"
                    onClick={() => submit(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const text = textFromParts(
                message.parts.map((part) => ({
                  type: part.type,
                  text:
                    "text" in part && typeof part.text === "string"
                      ? part.text
                      : undefined,
                })),
              );
              const mine = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      mine
                        ? "max-w-[88%] bg-primary break-words whitespace-pre-wrap text-primary-foreground sm:max-w-[80%]"
                        : "max-w-full bg-muted text-foreground sm:max-w-[92%]"
                    }`}
                  >
                    {mine ? text : <Markdown text={text} />}
                  </div>
                </div>
              );
            })
          )}
          {busy && messages.at(-1)?.role !== "assistant" ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {model ? `${model} is thinking…` : "Harbor is thinking…"}
            </p>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p>{error.message}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => regenerate({ body: requestBody })}
              >
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <form
        className="border-t bg-background"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
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
                submit(input);
              }
            }}
            placeholder="Message Harbor"
            aria-label="Message"
            enterKeyHint="send"
            rows={1}
            className="max-h-40 min-h-11 resize-none py-3 sm:max-h-48"
          />
          {busy ? (
            <Button
              type="button"
              size="icon-lg"
              variant="outline"
              className="size-11 shrink-0"
              onClick={() => stop()}
              aria-label="Stop generating"
            >
              <Square />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-lg"
              className="size-11 shrink-0"
              disabled={!input.trim() || !model}
              aria-label="Send message"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
