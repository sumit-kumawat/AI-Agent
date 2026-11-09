"use client";

import { Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatTopBar, useChatChrome } from "@/components/chat/chat-shell";
import { useAttachments } from "@/components/chat/attachments";
import { Composer } from "@/components/chat/composer";
import { jsonFetch } from "@/components/chat/conversation-actions";
import { pickModel, usePreferredModel, useWarmModel } from "@/components/chat/model-picker";
import { useResearchStatus } from "@/components/chat/research";
import { Button } from "@/components/ui/button";

import type { AttachmentInfo } from "@/lib/attachments/types";

/** Carries the first message into the new chat page, which sends it. */
export type Draft = { text: string; attachments: AttachmentInfo[]; research?: boolean };

export function draftKey(conversationId: string) {
  return `harbor-draft:${conversationId}`;
}

export function readDraft(conversationId: string): Draft | null {
  const raw = sessionStorage.getItem(draftKey(conversationId));
  if (!raw) return null;
  sessionStorage.removeItem(draftKey(conversationId));
  try {
    const value = JSON.parse(raw) as Draft;
    if (typeof value?.text === "string" && Array.isArray(value.attachments)) return value;
  } catch {
    // Older drafts were plain text.
  }
  return { text: raw, attachments: [] };
}

export function Greeting({ temporary = false }: { temporary?: boolean }) {
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
    </div>
  );
}

/** A blank chat. The conversation is created when the first message is sent. */
export function StartChat({ temporary }: { temporary: boolean }) {
  const router = useRouter();
  const { models, defaultModel, prefs } = useChatChrome();
  const preferred = usePreferredModel();
  const [picked, setPicked] = useState<string | null>(null);
  const model = pickModel(models, prefs.cloudModels, picked, preferred, defaultModel);
  const selected = models.find((option) => option.key === model) ?? null;
  useWarmModel(selected?.local ? selected.modelId : null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = useAttachments();
  const [research, setResearch] = useState(false);
  const { status: researchStatus } = useResearchStatus();

  async function start(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && files.ready.length === 0) || (research && !trimmed) || pending || !selected) return;
    setPending(true);
    setError(null);
    try {
      const conversation = await jsonFetch<{ id: string }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ model: selected.modelId, providerId: selected.providerId, temporary }),
      });
      const draft: Draft = { text: trimmed, attachments: files.ready, research };
      sessionStorage.setItem(draftKey(conversation.id), JSON.stringify(draft));
      files.clear();
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
        title={temporary ? "Temporary chat" : null}
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
          <Greeting temporary={temporary} />
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
            files={files}
            research={{ on: research, onChange: setResearch, status: researchStatus }}
          />
        </div>
      </div>
    </div>
  );
}
