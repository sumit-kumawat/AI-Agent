"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Archive, ArrowDown, EllipsisVertical, Pin, PinOff, Timer, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatTopBar, EditableTitle, useChatChrome } from "@/components/chat/chat-shell";
import { useAttachments } from "@/components/chat/attachments";
import { Composer } from "@/components/chat/composer";
import { OptimisationSelector, useOptimisation } from "@/components/chat/optimisation";
import { ContextMeter, useContextSnapshot } from "@/components/chat/context-meter";
import { useConversationActions } from "@/components/chat/conversation-actions";
import { AssistantMessage, UserMessage } from "@/components/chat/message";
import { pickModel, selectionBody, usePreferredModel, useWarmModel } from "@/components/chat/model-picker";
import { autoKey, autoModeOf, modelKey, type AutoMode } from "@/lib/model-ref";
import { Greeting, readDraft } from "@/components/chat/start-chat";
import { useResearchStatus } from "@/components/chat/research";
import { UpgradePrompt, UsageWarning } from "@/components/plans/upgrade-prompt";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AttachmentInfo } from "@/lib/attachments/types";
import type { ChatMessage } from "@/lib/chat-types";
import { assistantLabel } from "@/lib/models/branding";
import type { PlanBlock } from "@/lib/plans/types";
import type { ResearchData } from "@/lib/research/types";
import type { SearchSource } from "@/lib/web/types";
import { reasoningFromParts, textFromParts } from "@/lib/text";

function sentNow(attachments: AttachmentInfo[] = []) {
  return attachments.length ? { createdAt: Date.now(), attachments } : { createdAt: Date.now() };
}

/** Live progress while streaming, or the saved copy after a reload. */
function researchOf(message: ChatMessage): ResearchData | undefined {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index]!;
    if (part.type === "data-research") return part.data;
  }
  return message.metadata?.research;
}

function messageText(message: ChatMessage) {
  return textFromParts(
    message.parts.map((part) => ({
      type: part.type,
      text: "text" in part && typeof part.text === "string" ? part.text : undefined,
    })),
  );
}

function messageThinking(message: ChatMessage) {
  const live = reasoningFromParts(
    message.parts.map((part) => ({
      type: part.type,
      text: "text" in part && typeof part.text === "string" ? part.text : undefined,
    })),
  );
  return live || message.metadata?.thinking || null;
}

function searchSourcesOf(message: ChatMessage): SearchSource[] | undefined {
  let fromParts: SearchSource[] | undefined;
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index]!;
    if (part.type === "data-sources") {
      fromParts = part.data as SearchSource[];
      break;
    }
  }
  const fromMeta = message.metadata?.searchSources;
  // Prefer the list that already has citation marks (final SSE rewrite or saved meta).
  if (fromParts?.some((source) => source.cited)) return fromParts;
  if (fromMeta?.some((source) => source.cited)) return fromMeta;
  return fromMeta ?? fromParts;
}

function persistModes(conversationId: string, modes: { searchEnabled?: boolean; deepThink?: boolean }) {
  void fetch(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(modes),
  }).catch(() => undefined);
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
  conversationMode,
  conversationSearch = false,
  conversationDeepThink = false,
  pinned,
  archived,
  temporary,
  initialMessages,
}: {
  conversationId: string;
  title: string;
  conversationModel: string | null;
  conversationProvider: string | null;
  conversationMode: AutoMode | null;
  conversationSearch?: boolean;
  conversationDeepThink?: boolean;
  pinned: boolean;
  archived: boolean;
  temporary: boolean;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const { models, prefs, usage } = useChatChrome();
  const actions = useConversationActions();
  const preferred = usePreferredModel();
  const [picked, setPicked] = useState<string | null>(null);
  const [planBlock, setPlanBlock] = useState<PlanBlock | null>(null);
  const conversationKey = conversationMode
    ? autoKey(conversationMode)
    : conversationModel
      ? modelKey(conversationProvider ?? "ollama", conversationModel)
      : null;
  const model = pickModel(models, prefs.cloudModels, picked, conversationKey, preferred);
  const selected = models.find((option) => option.key === model) ?? null;
  const optimisation = useOptimisation(model, setPicked);
  useWarmModel(selected?.local ? selected.modelId : null);
  const [continuable, setContinuable] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        body: { conversationId },
        fetch: async (input, init) => {
          setPlanBlock(null);
          const response = await globalThis.fetch(input, init);
          if (!response.ok) {
            let message = "The model did not respond.";
            try {
              const data = (await response.json()) as { error?: string; plan?: PlanBlock };
              if (data.error) message = data.error;
              if (data.plan) setPlanBlock(data.plan);
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

  // router.refresh() updates RSC props but useChat keeps its own list. Re-apply
  // attachment chips (and other server meta) onto matching messages after refresh.
  useEffect(() => {
    setMessages((current) => {
      if (current.length === 0 && initialMessages.length === 0) return current;
      const server = new Map(initialMessages.map((message) => [message.id, message]));
      let changed = false;
      const next = current.map((message) => {
        const fresh = server.get(message.id);
        if (!fresh) return message;
        const serverFiles = fresh.metadata?.attachments;
        const localFiles = message.metadata?.attachments;
        if (!serverFiles?.length) return message;
        if (localFiles?.length === serverFiles.length && localFiles.every((file, index) => file.id === serverFiles[index]?.id)) {
          return message;
        }
        changed = true;
        return {
          ...message,
          metadata: { ...message.metadata, ...fresh.metadata, attachments: serverFiles },
        };
      });
      // First load / remount: prefer the full server transcript when the client list is empty.
      if (current.length === 0 && initialMessages.length > 0) return initialMessages;
      return changed ? next : current;
    });
  }, [initialMessages, setMessages]);

  const [input, setInput] = useState("");
  const files = useAttachments();
  const [research, setResearch] = useState(false);
  const [searchOn, setSearchOn] = useState(conversationSearch);
  const [deepThinkOn, setDeepThinkOn] = useState(conversationDeepThink);
  const [searchStatus, setSearchStatus] = useState<{ available: boolean | null; reason: string | null }>({
    available: null,
    reason: null,
  });
  const { status: researchStatus } = useResearchStatus();
  const sentDraft = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/search/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { available?: boolean; reason?: string | null } | null) => {
        if (cancelled) return;
        setSearchStatus({
          available: value?.available === true,
          reason: value?.reason ?? (value?.available ? null : "Search is unavailable."),
        });
      })
      .catch(() => {
        if (!cancelled) setSearchStatus({ available: false, reason: "Could not check Search." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reasoningModels = useMemo(
    () => models.filter((option) => option.skills.includes("reasoning")),
    [models],
  );
  const selectedSupportsThinking =
    selected?.skills.includes("reasoning") === true ||
    selected?.capabilities.some((capability) => capability.id === "reasoning") === true;

  function setSearch(next: boolean) {
    setSearchOn(next);
    if (next) setResearch(false);
    persistModes(conversationId, { searchEnabled: next });
  }
  function setDeepThink(next: boolean) {
    setDeepThinkOn(next);
    persistModes(conversationId, { deepThink: next });
  }
  const { scroller, content, atBottom, scrollToBottom } = useStickToBottom();
  const busy = status === "submitted" || status === "streaming";
  const requestBody = useMemo(() => selectionBody(model, models), [model, models]);

  // The server names the chat from the first message; show it while the reply streams.
  const untitled = title === "New chat";
  useEffect(() => {
    if (untitled && status === "streaming") router.refresh();
  }, [untitled, status, router]);

  useEffect(() => {
    if (sentDraft.current) return;
    const timer = window.setTimeout(() => {
      if (sentDraft.current) return;
      const draft = readDraft(conversationId);
      if (!draft) return;
      sentDraft.current = true;
      void sendMessage(
        { text: draft.text, metadata: sentNow(draft.attachments) },
        { body: draft.research ? { ...requestBody, research: true } : requestBody },
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, sendMessage, requestBody]);

  function send(
    text: string,
    options: { edit?: boolean; attachments?: AttachmentInfo[]; research?: boolean; search?: boolean; deepThink?: boolean } = {},
  ) {
    setContinuable(false);
    scrollToBottom();
    const useResearch = options.research === true;
    const useSearch = !useResearch && (options.search ?? searchOn);
    const attached = options.attachments ?? [];
    const metadata = sentNow(attached);
    void sendMessage(
      { text, metadata },
      {
        body: {
          ...requestBody,
          ...(options.edit ? { edit: true } : {}),
          ...(useResearch ? { research: true } : {}),
          ...(useSearch ? { search: true } : {}),
          ...((options.deepThink ?? deepThinkOn) ? { deepThink: true } : {}),
        },
      },
    ).then(() => {
      // Some transports drop custom metadata while streaming; put the chips back.
      if (!attached.length) return;
      setMessages((current) => {
        for (let index = current.length - 1; index >= 0; index -= 1) {
          const message = current[index]!;
          if (message.role !== "user") continue;
          if (message.metadata?.attachments?.length) return current;
          const copy = [...current];
          copy[index] = { ...message, metadata: { ...message.metadata, ...metadata } };
          return copy;
        }
        return current;
      });
    });
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && files.ready.length === 0) || (research && !trimmed) || busy) return;
    send(trimmed, { attachments: files.ready, research, search: searchOn, deepThink: deepThinkOn });
    files.clear();
    setResearch(false);
    setInput("");
  }

  /** The reply that followed message `index` was a research report, so redoing it should research again. */
  const wasResearch = (index: number) => {
    const reply = messages[index + 1];
    return reply?.role === "assistant" && Boolean(researchOf(reply));
  };

  function editAt(index: number, text: string) {
    if (busy) return;
    const attachments = messages[index]?.metadata?.attachments ?? [];
    const again = wasResearch(index);
    setMessages(messages.slice(0, index));
    send(text, {
      edit: true,
      attachments,
      research: again,
      search: !again && searchOn,
      deepThink: deepThinkOn,
    });
  }

  function retry() {
    setContinuable(false);
    scrollToBottom();
    const last = messages.at(-1);
    const again = last?.role === "assistant" ? Boolean(researchOf(last)) : false;
    const priorSearch = last?.role === "assistant" ? Boolean(searchSourcesOf(last)?.length || last.metadata?.searchNotice) : false;
    void regenerate({
      body: {
        ...requestBody,
        ...(again ? { research: true } : {}),
        ...(!again && (priorSearch || searchOn) ? { search: true } : {}),
        ...(deepThinkOn ? { deepThink: true } : {}),
      },
    });
  }

  const fetchedContext = useContextSnapshot({
    conversationId,
    model,
    temporary,
    version: `${messages.length}|${busy ? "busy" : "idle"}`,
  });
  const lastContext = [...messages].reverse().find((message) => message.role === "assistant")?.metadata?.context ?? null;

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
        actions={
          <>
            <OptimisationSelector
              mode={optimisation.mode}
              auto={optimisation.auto}
              onChange={optimisation.change}
              onUseAuto={optimisation.switchToAuto}
              disabled={busy}
            />
            {temporary ? null : <ConversationMenu id={conversationId} title={title} pinned={pinned} />}
          </>
        }
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
              <Greeting temporary={temporary} />
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
                      attachments={meta.attachments ?? []}
                      onEdit={busy ? undefined : (next) => editAt(index, next)}
                    />
                  );
                }
                const last = index === lastIndex;
                const report = researchOf(message);
                const thinking = messageThinking(message);
                const assistant = meta.model ? assistantLabel(models, meta.model, meta.provider) : undefined;
                return (
                  <AssistantMessage
                    key={message.id}
                    id={message.id}
                    text={text}
                    research={report}
                    web={meta.web}
                    searchSources={searchSourcesOf(message)}
                    searchNotice={meta.searchNotice}
                    thinking={thinking}
                    thinkingDone={!(last && status === "streaming") || Boolean(text)}
                    thinkingMs={meta.thinkingMs}
                    question={report ? messageText(messages[index - 1] ?? message) : undefined}
                    streaming={last && status === "streaming"}
                    last={last && !busy}
                    createdAt={meta.createdAt}
                    model={assistant}
                    autoReason={meta.auto?.reason}
                    memory={meta.memory}
                    note={
                      [
                        meta.fallbackFrom
                          ? `${meta.fallbackFrom} was unavailable, so this reply came from ${assistant ?? "the fallback assistant"}.`
                          : null,
                        ...(meta.fileNotes ?? []),
                        meta.webNotice ?? null,
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    feedback={meta.feedback ?? null}
                    persisted={!(last && busy)}
                    onRegenerate={last && !busy ? retry : undefined}
                    onContinue={last && !busy && continuable ? () => send("Continue from where you stopped.") : undefined}
                    followUp={
                      last && !busy && report
                        ? {
                            onAsk: (prompt, deep) => send(prompt, { research: deep }),
                            canResearch: !usage.locked.research && researchStatus?.available === true,
                          }
                        : undefined
                    }
                  />
                );
              })
            )}
            {waiting ? <AssistantMessage text="" streaming last={false} /> : null}
            {error && planBlock ? (
              <UpgradePrompt block={planBlock} onRetry={retry} />
            ) : error ? (
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
      <UsageWarning usage={usage} />
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onStop={() => void stop()}
        busy={busy}
        models={models}
        model={model}
        onModelChange={setPicked}
        mode={optimisation.mode}
        sendWithEnter={prefs.sendWithEnter}
        note={temporary ? "Temporary chat: not saved to history or memory." : undefined}
        files={files}
        research={{
          on: research,
          onChange: (on) => {
            setResearch(on);
            if (on) setSearch(false);
          },
          status: researchStatus,
        }}
        search={{
          on: searchOn,
          onChange: setSearch,
          available: searchStatus.available,
          reason: searchStatus.reason,
        }}
        deepThink={{
          on: deepThinkOn,
          onChange: setDeepThink,
          supported: selectedSupportsThinking || (autoModeOf(model) !== null && reasoningModels.length > 0),
          alternatives: reasoningModels,
        }}
        locked={usage.locked}
        meter={<ContextMeter snapshot={busy ? (lastContext ?? fetchedContext) : fetchedContext} draft={input.length} reported={busy ? null : lastContext?.reported} />}
      />
    </div>
  );
}
