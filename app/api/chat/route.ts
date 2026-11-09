import type { LanguageModelUsage, ModelMessage, UIMessage } from "ai";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { z } from "zod";
import { startSession } from "@/lib/agents";
import { contextBudget, documentContext, imageParts } from "@/lib/attachments/context";
import { AttachmentError, bindAttachments, ownedAttachments, type Attachment } from "@/lib/attachments/store";
import { auth } from "@/lib/auth";
import type { ChatMessageMeta } from "@/lib/chat-types";
import {
  findUserById,
  getConversationForUser,
  maybeSetTitle,
  quotaState,
  recentConversationTitles,
  recordUsage,
  saveAssistantMessage,
  setConversationModel,
  syncTranscript,
} from "@/lib/db/queries";
import { addMemory, explicitMemory, MemoryError, relevantMemories } from "@/lib/memory";
import { findBlockedKeyword } from "@/lib/moderation";
import { getPreferences } from "@/lib/preferences";
import { buildInstructions } from "@/lib/prompt";
import { noteProviderFailure, resolveChatTarget } from "@/lib/providers/catalog";
import { costMicro, languageModel, safeProviderError } from "@/lib/providers/engine";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { researchStream } from "@/lib/research/run";
import { getSettings } from "@/lib/settings";
import { textFromParts } from "@/lib/text";
import { chatRequestSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

const AGENT_ID = "ollama";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MODEL_CONTEXT_MESSAGES = 40;
/** Earlier images are re-sent so follow-up questions still see them, up to this many. */
const MAX_IMAGES_IN_CONTEXT = 6;

const attachmentRefs = z.array(z.object({ id: z.uuid() })).max(10);

function attachmentIds(metadata: unknown) {
  const value = metadata && typeof metadata === "object" ? (metadata as { attachments?: unknown }).attachments : undefined;
  const parsed = attachmentRefs.safeParse(value ?? []);
  return parsed.success ? [...new Set(parsed.data.map((item) => item.id))] : null;
}

/** Ollama sometimes omits usage; fall back to roughly four characters per token. */
function estimateTokens(characters: number) {
  return Math.ceil(characters / 4);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = findUserById(session.user.id);
  if (!user || user.suspended) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(
    `chat:${user.id}`,
    getSettings().chatRateLimitPerMinute,
    60 * 1000,
    { endpoint: "chat", userId: user.id },
  );
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Conversation is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json(
        { error: "Conversation is too large." },
        { status: 413 },
      );
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const conversation = getConversationForUser(parsed.data.conversationId, user.id);
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = parsed.data.messages as UIMessage[];
  const filesByMessage = new Map<string, string[]>();
  let badAttachments = false;
  const transcript = messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = textFromParts(
      message.parts.map((part) => ({
        type: part.type,
        text:
          "text" in part && typeof part.text === "string" ? part.text : undefined,
      })),
    );
    const ids = message.role === "user" ? attachmentIds(message.metadata) : [];
    if (ids === null) badAttachments = true;
    const hasFiles = Boolean(ids?.length);
    if (hasFiles) filesByMessage.set(message.id, ids!);
    if (!content.trim() && !hasFiles) return [];
    return [{ id: message.id, role: message.role, content, hasFiles }];
  });
  if (badAttachments) {
    return Response.json({ error: "Attach up to 10 files per message." }, { status: 400 });
  }

  const latestUser = [...transcript].reverse().find((message) => message.role === "user");
  if (!latestUser) {
    return Response.json(
      { error: "Send a message before asking the model to reply." },
      { status: 400 },
    );
  }

  // Everything below that can reject runs before history is touched, so a
  // refused request never rewrites the stored conversation.
  const prefs = getPreferences(user.id);
  const resolved = await resolveChatTarget({
    requestedProvider: parsed.data.providerId,
    requestedModel: parsed.data.model,
    conversationProvider: conversation.providerId,
    conversationModel: conversation.model,
    allowCloud: prefs.cloudModels,
  });
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const chosen = resolved.target.model;
  const modelName = chosen.modelId;

  let files: Map<string, Attachment>;
  try {
    files = ownedAttachments(user.id, conversation.id, filesByMessage);
  } catch (error) {
    if (error instanceof AttachmentError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const filesOf = (messageId: string) =>
    (filesByMessage.get(messageId) ?? []).map((id) => files.get(id)).filter((row): row is Attachment => Boolean(row));
  const latestImages = filesOf(latestUser.id).filter((row) => row.kind === "image");
  if (latestImages.length > 0 && !chosen.vision) {
    return Response.json(
      {
        error: `${modelName} cannot read images. Pick a model that accepts images (marked in the model list), or remove the image.`,
      },
      { status: 400 },
    );
  }

  if (findBlockedKeyword(latestUser.content)) {
    recordUsage({
      userId: user.id,
      conversationId: conversation.id,
      agentId: AGENT_ID,
      model: modelName,
      providerId: chosen.providerId,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      status: "blocked",
    });
    return Response.json(
      { error: "This message contains content that is not allowed on this server." },
      { status: 400 },
    );
  }

  const research = parsed.data.research === true;
  if (research) {
    if (!latestUser.content.trim()) {
      return Response.json({ error: "Describe what to research." }, { status: 400 });
    }
    const researchLimit = rateLimit(`research:${user.id}`, 10, 10 * 60 * 1000, {
      endpoint: "research",
      userId: user.id,
    });
    if (!researchLimit.ok) return tooManyRequests(researchLimit.retryAfter);
  }

  const quota = quotaState(user.id);
  if (quota?.exceeded) {
    return Response.json(
      {
        error: `You have used your monthly allowance of ${quota.limit?.toLocaleString("en-US")} tokens. Ask an admin to raise it.`,
      },
      { status: 429 },
    );
  }

  const agent = startSession(
    {
      agentId: AGENT_ID,
      userId: user.id,
      userEmail: user.email,
      conversationId: conversation.id,
      model: modelName,
    },
    request.signal,
  );
  if (!agent.ok) {
    return Response.json({ error: agent.error }, { status: agent.status });
  }

  syncTranscript(conversation.id, transcript, { replace: parsed.data.edit === true });
  bindAttachments(user.id, conversation.id, filesByMessage);
  maybeSetTitle(conversation.id, conversation.title, latestUser.content || (filesOf(latestUser.id)[0]?.name ?? ""));

  const remembering = !conversation.temporary && prefs.memoryEnabled;
  let savedMemory: string | undefined;
  const fact = remembering && transcript.at(-1)?.role === "user" ? explicitMemory(latestUser.content) : null;
  if (fact) {
    try {
      savedMemory = addMemory(user.id, fact, { source: "chat", conversationId: conversation.id }).content;
    } catch (error) {
      if (!(error instanceof MemoryError)) console.error("Failed to save memory", error);
    }
  }
  const baseInstructions = buildInstructions({
    prefs,
    userName: user.name,
    memories: remembering ? relevantMemories(user.id, latestUser.content) : [],
    recentTitles:
      !conversation.temporary && prefs.referenceHistory
        ? recentConversationTitles(user.id, conversation.id)
        : [],
    temporary: conversation.temporary,
  });
  const documents = documentContext(
    transcript.flatMap((message) => filesOf(message.id)),
    latestUser.content || "Summarize the attached files.",
    contextBudget(chosen.local),
  );
  const instructions = documents.text ? `${baseInstructions}\n\n${documents.text}` : baseInstructions;

  if (modelName !== conversation.model || (conversation.providerId ?? "ollama") !== chosen.providerId) {
    setConversationModel(conversation.id, modelName, chosen.providerId);
  }

  let chatModel: ReturnType<typeof languageModel>;
  try {
    chatModel = languageModel(chosen.providerId, modelName);
  } catch (error) {
    agent.end();
    return Response.json({ error: safeProviderError(chosen.providerId, error) }, { status: 503 });
  }

  if (research) {
    const researchFiles = transcript.flatMap((message) => filesOf(message.id)).filter((row) => row.kind !== "image");
    const researchDocs = documentContext(researchFiles, latestUser.content, chosen.local ? 4_000 : 20_000);
    const startedAt = Date.now();
    const meta: ChatMessageMeta = {
      createdAt: startedAt,
      model: modelName,
      provider: chosen.providerName,
      ...(resolved.target.fallbackFrom ? { fallbackFrom: resolved.target.fallbackFrom.name } : {}),
    };
    const messageId = crypto.randomUUID();
    return createUIMessageStreamResponse({
      stream: researchStream(
        {
          model: chatModel,
          local: chosen.local,
          question: latestUser.content,
          history: transcript.slice(0, -1).slice(-6).map((message) => ({ role: message.role, content: message.content })),
          documents: researchDocs.text,
          fileNames: researchFiles.map((row) => row.name),
          meta,
          messageId,
          signal: agent.signal,
        },
        (outcome) => {
          agent.end();
          if (outcome.failed && !agent.signal.aborted) noteProviderFailure(chosen.providerId);
          try {
            saveAssistantMessage(conversation.id, {
              id: messageId,
              content: outcome.content,
              meta: { model: meta.model, provider: meta.provider, fallbackFrom: meta.fallbackFrom, research: outcome.data },
            });
          } catch (error) {
            console.error("Failed to save the research report", error);
          }
          try {
            const inputTokens = outcome.usage.inputTokens || estimateTokens(outcome.promptChars);
            const outputTokens = outcome.usage.outputTokens || estimateTokens(outcome.content.length);
            recordUsage({
              userId: user.id,
              conversationId: conversation.id,
              agentId: AGENT_ID,
              model: modelName,
              providerId: chosen.providerId,
              inputTokens,
              outputTokens,
              costMicro: costMicro(chosen.providerId, modelName, inputTokens, outputTokens),
              durationMs: Date.now() - startedAt,
              status: agent.signal.aborted ? "aborted" : outcome.failed ? "error" : "ok",
            });
          } catch (error) {
            console.error("Failed to record usage", error);
          }
        },
      ),
    });
  }

  const cleanMessages: UIMessage[] = transcript.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));

  const context = transcript.slice(-MODEL_CONTEXT_MESSAGES);
  let imageBudget = MAX_IMAGES_IN_CONTEXT;
  const visibleImages = new Set<string>();
  for (const message of [...context].reverse()) {
    for (const row of filesOf(message.id)) {
      if (row.kind === "image" && chosen.vision && imageBudget > 0) {
        visibleImages.add(row.id);
        imageBudget -= 1;
      }
    }
  }
  const modelMessages: ModelMessage[] = context.map((message) => {
    if (message.role === "assistant") return { role: "assistant", content: message.content };
    const attached = filesOf(message.id);
    if (attached.length === 0) return { role: "user", content: message.content };
    const names = attached.map((row) => row.name).join(", ");
    const hidden = attached.filter((row) => row.kind === "image" && !visibleImages.has(row.id));
    const text = [
      message.content || "(The user sent the attached files without a message.)",
      `[Attached: ${names}]`,
      hidden.length ? `[Images not shown to you: ${hidden.map((row) => row.name).join(", ")}]` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const images = imageParts(attached.filter((row) => visibleImages.has(row.id)));
    return { role: "user", content: images.length ? [{ type: "text", text }, ...images] : text };
  });

  const startedAt = Date.now();
  let usage: LanguageModelUsage | undefined;
  let failed = false;
  const meta: ChatMessageMeta = {
    createdAt: startedAt,
    model: modelName,
    provider: chosen.providerName,
    ...(resolved.target.fallbackFrom ? { fallbackFrom: resolved.target.fallbackFrom.name } : {}),
    ...(savedMemory ? { memory: savedMemory } : {}),
    ...(documents.notes.length ? { fileNotes: documents.notes } : {}),
  };

  const result = streamText({
    model: chatModel,
    instructions,
    messages: modelMessages,
    maxOutputTokens: 4096,
    abortSignal: agent.signal,
    onFinish: (event) => {
      usage = event.totalUsage;
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: cleanMessages,
      messageMetadata: ({ part }) => (part.type === "start" ? meta : undefined),
      generateMessageId: () => crypto.randomUUID(),
      onError: (error) => {
        failed = true;
        agent.end();
        noteProviderFailure(chosen.providerId);
        const detail = safeProviderError(chosen.providerId, error);
        console.error("Chat stream failed", chosen.providerId, modelName, detail);
        return chosen.local
          ? `${modelName} stopped responding. Check that Ollama is running, or pick a smaller model.`
          : `${chosen.providerName} did not respond. ${detail}`;
      },
      onFinish: async ({ responseMessage, isAborted }) => {
        agent.end();
        const content = textFromParts(
          responseMessage.parts.map((part) => ({
            type: part.type,
            text:
              "text" in part && typeof part.text === "string"
                ? part.text
                : undefined,
          })),
        );
        try {
          saveAssistantMessage(conversation.id, {
            id: responseMessage.id || crypto.randomUUID(),
            content,
            meta: {
              model: meta.model,
              provider: meta.provider,
              fallbackFrom: meta.fallbackFrom,
              memory: meta.memory,
              fileNotes: meta.fileNotes,
            },
          });
        } catch (error) {
          console.error("Failed to save the assistant reply", error);
        }
        try {
          const promptChars = instructions.length + context.reduce((sum, m) => sum + m.content.length, 0);
          recordUsage({
            userId: user.id,
            conversationId: conversation.id,
            agentId: AGENT_ID,
            model: modelName,
            providerId: chosen.providerId,
            inputTokens: usage?.inputTokens ?? estimateTokens(promptChars),
            outputTokens: usage?.outputTokens ?? estimateTokens(content.length),
            costMicro: costMicro(
              chosen.providerId,
              modelName,
              usage?.inputTokens ?? estimateTokens(promptChars),
              usage?.outputTokens ?? estimateTokens(content.length),
            ),
            durationMs: Date.now() - startedAt,
            status: failed ? "error" : isAborted ? "aborted" : "ok",
          });
        } catch (error) {
          console.error("Failed to record usage", error);
        }
      },
    }),
  });
}
