"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatTopBar, EditableTitle, useChatChrome } from "@/components/chat/chat-shell";
import { Composer } from "@/components/chat/composer";
import { AssistantMessage, UserMessage } from "@/components/chat/message";
import { pickModel, usePreferredModel, useWarmModel } from "@/components/chat/model-picker";
import { Greeting } from "@/components/chat/start-chat";
import { Button } from "@/components/ui/button";
import { textFromParts } from "@/lib/text";

function messageText(message: UIMessage) {
  return textFromParts(
    message.parts.map((part) => ({
      type: part.type,
      text: "text" in part && typeof part.text === "string" ? part.text : undefined,
    })),
  );
}

/**
 * Keeps the view pinned to the newest content while it grows, and lets go as
 * soon as the reader scrolls up. Scrolling back to the bottom re-pins it.
 */
function useStickToBottom() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = scroller.current;
    if (!node) return;
    pinned.current = true;
    setAtBottom(true);
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const node = scroller.current;
    const inner = content.current;
    if (!node || !inner) return;
    node.scrollTop = node.scrollHeight;
    const distance = () => node.scrollHeight - node.scrollTop - node.clientHeight;

    const observer = new ResizeObserver(() => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
      else setAtBottom(distance() < 48);
    });
    observer.observe(inner);

    const onScroll = () => {
      const near = distance() < 48;
      if (near) pinned.current = true;
      setAtBottom(near);
    };
    // Intent to read back: release immediately, before the next chunk arrives.
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && node.scrollHeight > node.clientHeight) pinned.current = false;
    };
    const onTouchMove = () => {
      if (distance() > 48) pinned.current = false;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("wheel", onWheel, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return { scroller, content, atBottom, scrollToBottom };
}

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
    onFinish: () => router.refresh(),
  });
  const [input, setInput] = useState("");
  const sentDraft = useRef(false);
  const { scroller, content, atBottom, scrollToBottom } = useStickToBottom();
  const busy = status === "submitted" || status === "streaming";
  const requestBody = useMemo(() => (model ? { model } : {}), [model]);

  // The server names the chat from the first message; show it while the reply streams.
  const untitled = title === "New chat";
  useEffect(() => {
    if (untitled && status === "streaming") router.refresh();
  }, [untitled, status, router]);

  useEffect(() => {
    if (sentDraft.current) return;
    const key = `harbor-draft:${conversationId}`;
    const draft = sessionStorage.getItem(key);
    if (!draft) return;
    const timer = window.setTimeout(() => {
      if (sentDraft.current) return;
      sentDraft.current = true;
      sessionStorage.removeItem(key);
      void sendMessage({ text: draft }, { body: requestBody });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, sendMessage, requestBody]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    scrollToBottom();
    void sendMessage({ text: trimmed }, { body: requestBody });
    setInput("");
  }

  function retry() {
    scrollToBottom();
    void regenerate({ body: requestBody });
  }

  const lastIndex = messages.length - 1;
  const waiting = busy && messages.at(-1)?.role !== "assistant";

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar title={<EditableTitle key={title} id={conversationId} title={title} />} />
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} data-chat-scroller className="h-full overflow-y-auto overscroll-contain">
          <div ref={content} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-10">
            {messages.length === 0 && !busy ? (
              <Greeting onPick={submit} />
            ) : (
              messages.map((message, index) => {
                const text = messageText(message);
                if (message.role === "user") return <UserMessage key={message.id} text={text} />;
                const last = index === lastIndex;
                return (
                  <AssistantMessage
                    key={message.id}
                    text={text}
                    streaming={last && status === "streaming"}
                    last={last && !busy}
                    onRegenerate={last && !busy ? retry : undefined}
                  />
                );
              })
            )}
            {waiting ? <AssistantMessage text="" streaming last={false} /> : null}
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                <p>{error.message}</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {atBottom ? null : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute bottom-3 left-1/2 size-9 -translate-x-1/2 rounded-full bg-background shadow-md"
            onClick={() => scrollToBottom("smooth")}
            aria-label="Scroll to latest message"
          >
            <ArrowDown />
          </Button>
        )}
      </div>
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onStop={() => void stop()}
        busy={busy}
        models={models}
        model={model}
        onModelChange={setPicked}
      />
    </div>
  );
}
