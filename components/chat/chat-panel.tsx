"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Archive, ArrowDown, EllipsisVertical, Pin, PinOff, Timer, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatTopBar, EditableTitle, useChatChrome } from "@/components/chat/chat-shell";
import { Composer } from "@/components/chat/composer";
import { useConversationActions } from "@/components/chat/conversation-actions";
import { AssistantMessage, UserMessage } from "@/components/chat/message";
import { pickModel, usePreferredModel, useWarmModel } from "@/components/chat/model-picker";
import { modelKey } from "@/lib/model-ref";
import { Greeting } from "@/components/chat/start-chat";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatMessage } from "@/lib/chat-types";
import { textFromParts } from "@/lib/text";

function sentNow() {
  return { createdAt: Date.now() };
}

function messageText(message: ChatMessage) {
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

function ConversationMenu({ id, title, pinned }: { id: string; title: string; pinned: boolean }) {
  const actions = useConversationActions();
  const conversation = { id, title };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Chat options">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => void actions.setPinned(conversation, !pinned)}>
          {pinned ? <PinOff /> : <Pin />}
          {pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void actions.setArchived(conversation, true)}>
          <Archive />
          Archive
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void actions.remove(conversation)}>
          <Trash />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChatPanel({
  conversationId,
  title,
  conversationModel,
  conversationProvider,
  pinned,
  archived,
  temporary,
  initialMessages,
}: {
  conversationId: string;
  title: string;
  conversationModel: string | null;
  conversationProvider: string | null;
  pinned: boolean;
  archived: boolean;
  temporary: boolean;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const { models, defaultModel, prefs } = useChatChrome();
  const actions = useConversationActions();
  const preferred = usePreferredModel();
  const [picked, setPicked] = useState<string | null>(null);
  const conversationKey = conversationModel
    ? modelKey(conversationProvider ?? "ollama", conversationModel)
    : null;
  const model = pickModel(models, prefs.cloudModels, picked, conversationKey, preferred, defaultModel);
  const selected = models.find((option) => option.key === model) ?? null;
  useWarmModel(selected?.local ? selected.modelId : null);
  const [continuable, setContinuable] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
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
  const { messages, setMessages, sendMessage, status, stop, error, regenerate } = useChat<ChatMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    onFinish: ({ finishReason, isAbort }) => {
      setContinuable(isAbort || finishReason === "length");
      router.refresh();
    },
  });
  const [input, setInput] = useState("");
  const sentDraft = useRef(false);
  const { scroller, content, atBottom, scrollToBottom } = useStickToBottom();
  const busy = status === "submitted" || status === "streaming";
  const requestBody = useMemo(
    () => (selected ? { model: selected.modelId, providerId: selected.providerId } : {}),
    [selected],
  );

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
      void sendMessage({ text: draft, metadata: sentNow() }, { body: requestBody });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, sendMessage, requestBody]);

  function send(text: string, edit = false) {
    setContinuable(false);
    scrollToBottom();
    void sendMessage({ text, metadata: sentNow() }, { body: edit ? { ...requestBody, edit: true } : requestBody });
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    send(trimmed);
    setInput("");
  }

  function editAt(index: number, text: string) {
    if (busy) return;
    setMessages(messages.slice(0, index));
    send(text, true);
  }

  function retry() {
    setContinuable(false);
    scrollToBottom();
    void regenerate({ body: requestBody });
  }

  const lastIndex = messages.length - 1;
  const waiting = busy && messages.at(-1)?.role !== "assistant";

  return (
    <div className="flex h-full flex-col">
      <ChatTopBar
        title={
          temporary ? (
            <span className="flex items-center gap-1.5 px-2 text-sm font-medium">
              <Timer className="size-4" />
              Temporary chat
            </span>
          ) : (
            <EditableTitle key={title} id={conversationId} title={title} />
          )
        }
        actions={temporary ? null : <ConversationMenu id={conversationId} title={title} pinned={pinned} />}
      />
      {archived ? (
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pb-2 text-sm text-muted-foreground">
          <span>This chat is archived.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void actions.setArchived({ id: conversationId, title }, false)}
          >
            Restore
          </Button>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} data-chat-scroller className="h-full overflow-y-auto overscroll-contain">
          <div
            ref={content}
            className="mx-auto flex w-full max-w-3xl flex-col gap-[var(--chat-gap)] px-4 pt-4 pb-10"
          >
            {messages.length === 0 && !busy ? (
              <Greeting onPick={submit} temporary={temporary} />
            ) : (
              messages.map((message, index) => {
                const text = messageText(message);
                const meta = message.metadata ?? {};
                if (message.role === "user") {
                  return (
                    <UserMessage
                      key={message.id}
                      text={text}
                      createdAt={meta.createdAt}
                      onEdit={busy ? undefined : (next) => editAt(index, next)}
                    />
                  );
                }
                const last = index === lastIndex;
                return (
                  <AssistantMessage
                    key={message.id}
                    id={message.id}
                    text={text}
                    streaming={last && status === "streaming"}
                    last={last && !busy}
                    createdAt={meta.createdAt}
                    model={meta.model}
                    memory={meta.memory}
                    note={
                      meta.fallbackFrom
                        ? `${meta.fallbackFrom} was unavailable, so this reply came from ${meta.model ?? "the fallback model"}.`
                        : undefined
                    }
                    feedback={meta.feedback ?? null}
                    persisted={!(last && busy)}
                    onRegenerate={last && !busy ? retry : undefined}
                    onContinue={last && !busy && continuable ? () => send("Continue from where you stopped.") : undefined}
                  />
                );
              })
            )}
            {waiting ? <AssistantMessage text="" streaming last={false} /> : null}
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" role="alert">
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
        sendWithEnter={prefs.sendWithEnter}
        note={temporary ? "Temporary chat: not saved to history or memory." : undefined}
      />
    </div>
  );
}
