import type { LanguageModelUsage, ModelMessage, UIMessage } from "ai";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  streamText,
  toUIMessageStream,
  wrapLanguageModel,
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
  recentConversationTitles,
  recordUsage,
  saveAssistantMessage,
  recordModelSelection,
  setConversationModel,
  setConversationModes,
  syncTranscript,
} from "@/lib/db/queries";
import { analyzeTask } from "@/lib/models/router";
import { capabilityBlock, modelBlock, modelsForUser } from "@/lib/plans/entitlements";
import type { PlanBlock } from "@/lib/plans/types";
import { checkAllowance } from "@/lib/plans/usage";
import { addMemory, explicitMemory, MemoryError, relevantMemories } from "@/lib/memory";
import { findBlockedKeyword } from "@/lib/moderation";
import { getPreferences } from "@/lib/preferences";
import {
  IMAGE_TOKENS,
  estimateTokens as tokensOf,
  planHistory,
  replyReserve,
  snapshot,
  summarize,
  summaryBlock,
  windowOf,
} from "@/lib/context/compress";
import type { ContextCategory } from "@/lib/context/types";
import { instructionParts } from "@/lib/prompt";
import { linkReadingEnabled } from "@/lib/research/config";
import { extractLinks, NO_BROWSING_MESSAGE, readLinks, webAccessNote, webBlock } from "@/lib/web/links";
import type { SearchSource, WebSource } from "@/lib/web/types";
import { listSelectableModels, noteProviderFailure, resolveChatTarget } from "@/lib/providers/catalog";
import { costMicro, languageModel, safeProviderError } from "@/lib/providers/engine";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { researchStream } from "@/lib/research/run";
import { gatherSearchContext, markCitedSources } from "@/lib/search/run";
import { getSettings } from "@/lib/settings";
import { reasoningFromParts, textFromParts } from "@/lib/text";
import { chatRequestSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

const AGENT_ID = "ollama";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
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

const MAX_OUTPUT_TOKENS = 4096;

/** Keeps one reply from running far past the allowance that is left. */
function outputCap(remaining: number | null) {
  return remaining === null ? MAX_OUTPUT_TOKENS : Math.max(256, Math.min(MAX_OUTPUT_TOKENS, remaining));
}

/** A plan refusal the client turns into an upgrade prompt. */
function planBlocked(block: PlanBlock, status = 403) {
  return Response.json({ error: block.message, plan: block }, { status });
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

  const prefs = getPreferences(user.id);
  const mode = parsed.data.model ? undefined : parsed.data.mode;
  const task = mode
    ? analyzeTask({
        text: latestUser.content,
        images: latestImages.length > 0,
        documents: transcript.some((message) => filesOf(message.id).some((row) => row.kind !== "image")),
        historyChars: transcript.reduce((total, message) => total + message.content.length, 0),
      })
    : undefined;
  const research = parsed.data.research === true;
  const search = !research && parsed.data.search === true;
  const deepThink = parsed.data.deepThink === true;
  const feature = research ? "research" : "chat";
  const capability = research
    ? capabilityBlock(user, "research")
    : filesOf(latestUser.id).length > 0
      ? capabilityBlock(user, "attachments")
      : null;
  if (capability) return planBlocked(capability);
  setConversationModes(conversation.id, user.id, {
    ...(parsed.data.search !== undefined ? { searchEnabled: search } : {}),
    ...(parsed.data.deepThink !== undefined ? { deepThink } : {}),
  });

  const entitled = await modelsForUser(user);
  const resolved = await resolveChatTarget({
    requestedProvider: parsed.data.providerId,
    requestedModel: parsed.data.model,
    conversationProvider: conversation.providerId,
    conversationModel: conversation.model,
    allowCloud: prefs.cloudModels,
    mode,
    task,
    catalog: entitled,
  });
  if (!resolved.ok) {
    if (parsed.data.model) {
      const { models: everything } = await listSelectableModels();
      const restricted = everything.find(
        (model) =>
          model.modelId === parsed.data.model && model.providerId === (parsed.data.providerId ?? "ollama"),
      );
      const block = restricted ? modelBlock(user, restricted) : null;
      if (block) return planBlocked(block);
    }
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const chosen = resolved.target.model;
  const modelName = chosen.modelId;
  const autoInfo = resolved.target.auto;
  if (latestImages.length > 0 && !chosen.vision) {
    return Response.json(
      {
        error: `${chosen.name} cannot read images. Pick an assistant marked "Image understanding", or remove the image.`,
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
      { error: "This message contains content that is not allowed." },
      { status: 400 },
    );
  }

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

  const allowance = checkAllowance(user, { model: modelName, feature });
  if (!allowance.ok) return planBlocked(allowance.block, 429);

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
  const promptParts: { category: ContextCategory; text: string }[] = instructionParts({
    prefs,
    userName: user.name,
    memories: remembering ? relevantMemories(user.id, latestUser.content) : [],
    recentTitles:
      !conversation.temporary && prefs.referenceHistory
        ? recentConversationTitles(user.id, conversation.id)
        : [],
    temporary: conversation.temporary,
  });
  const window = windowOf(chosen);
  const documents = documentContext(
    transcript.flatMap((message) => filesOf(message.id)),
    latestUser.content || "Summarize the attached files.",
    contextBudget(chosen.local, window.tokens),
  );
  if (documents.text) promptParts.push({ category: "attachments", text: documents.text });

  const modelMode = autoInfo?.mode ?? null;
  if (
    modelName !== conversation.model ||
    (conversation.providerId ?? "ollama") !== chosen.providerId ||
    modelMode !== conversation.modelMode
  ) {
    setConversationModel(conversation.id, modelName, chosen.providerId, modelMode);
  }
  if (autoInfo && task) {
    recordModelSelection({
      userId: user.id,
      conversationId: conversation.temporary ? null : conversation.id,
      mode: autoInfo.mode,
      task: task.kind,
      complexity: task.complexity,
      providerId: chosen.providerId,
      model: modelName,
      reason: autoInfo.reason,
    });
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
      ...(autoInfo ? { auto: autoInfo } : {}),
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
              meta: { model: meta.model, provider: meta.provider, fallbackFrom: meta.fallbackFrom, auto: meta.auto, research: outcome.data },
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
              feature: "research",
              estimated: !outcome.usage.inputTokens || !outcome.usage.outputTokens,
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

  const browsing = linkReadingEnabled();
  promptParts.push({ category: "system", text: webAccessNote(browsing) });
  const pasted = extractLinks(latestUser.content);
  const links = !search && browsing ? pasted : [];
  const webNotice = !browsing && pasted.length ? NO_BROWSING_MESSAGE : undefined;
  let webSources: WebSource[] = [];
  let searchSources: SearchSource[] = [];
  let searchNotice: string | undefined;
  if (search) {
    if (!browsing) {
      searchNotice = NO_BROWSING_MESSAGE;
      promptParts.push({ category: "system", text: `Search was requested but web access is turned off. Begin with: "${NO_BROWSING_MESSAGE}"` });
    } else {
      const gathered = await gatherSearchContext({
        userId: user.id,
        question: latestUser.content,
        budget: Math.min(8_000, contextBudget(chosen.local, window.tokens)),
        signal: agent.signal,
      });
      searchSources = gathered.sources;
      searchNotice = gathered.notice;
      if (gathered.promptBlock) promptParts.push({ category: "web", text: gathered.promptBlock });
      else if (gathered.notice) promptParts.push({ category: "system", text: gathered.notice });
    }
  } else if (links.length) {
    const pages = await readLinks(user.id, links, contextBudget(chosen.local, window.tokens), agent.signal);
    promptParts.push({ category: "web", text: webBlock(pages) });
    webSources = pages.map((page) => ({ url: page.url, title: page.title, ok: page.ok, error: page.error, chars: page.chars }));
  }
  if (deepThink) {
    const canThink = chosen.skills.includes("reasoning") || chosen.capabilities.some((capability) => capability.id === "reasoning");
    if (canThink) {
      promptParts.push({
        category: "system",
        text: "DeepThink is on. Work through the problem step by step inside <think>...</think> before your final answer. Keep the final answer clear and separate from the reasoning.",
      });
    } else {
      promptParts.push({
        category: "system",
        text: "DeepThink was requested but this assistant does not report reasoning support. Answer carefully and say so briefly if step-by-step hidden reasoning is unavailable.",
      });
    }
  }

  const cleanMessages: UIMessage[] = transcript.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));

  let imageBudget = MAX_IMAGES_IN_CONTEXT;
  const visibleImages = new Set<string>();
  for (const message of [...transcript].reverse()) {
    for (const row of filesOf(message.id)) {
      if (row.kind === "image" && chosen.vision && imageBudget > 0) {
        visibleImages.add(row.id);
        imageBudget -= 1;
      }
    }
  }
  const imagesIn = (messageId: string) => filesOf(messageId).filter((row) => visibleImages.has(row.id)).length;
  const sized = transcript.map((message) => ({ ...message, extraTokens: imagesIn(message.id) * IMAGE_TOKENS }));
  const fixedTokens = promptParts.reduce((sum, part) => sum + tokensOf(part.text), 0);
  const windowTokens = window.tokens ?? 8_192;
  let history = planHistory({
    conversationId: conversation.temporary ? null : conversation.id,
    messages: sized,
    budget: Math.max(1_024, windowTokens - replyReserve(windowTokens) - fixedTokens),
  });
  let summaryText = history.summary;
  if (history.pending > 0) {
    try {
      const made = await summarize({
        conversationId: conversation.temporary ? null : conversation.id,
        model: chatModel,
        messages: sized,
        plan: history,
        budget: windowTokens - 1_500,
        signal: agent.signal,
      });
      summaryText = made.summary;
      recordUsage({
        userId: user.id,
        conversationId: conversation.id,
        agentId: AGENT_ID,
        model: modelName,
        providerId: chosen.providerId,
        feature: "summary",
        estimated: made.usage.estimated,
        inputTokens: made.usage.input,
        outputTokens: made.usage.output,
        costMicro: costMicro(chosen.providerId, modelName, made.usage.input, made.usage.output),
        durationMs: 0,
        status: "ok",
      });
    } catch (error) {
      console.error("Summarising older messages failed", error);
      // Without a summary, older messages are left out rather than overflowing the window.
      summaryText = null;
    }
    history = { ...history, pending: 0 };
  }
  if (summaryText) promptParts.push({ category: "summary", text: summaryBlock(summaryText) });
  const context = transcript.slice(history.keepFrom);
  for (const row of visibleImages) {
    if (!context.some((message) => filesOf(message.id).some((file) => file.id === row))) visibleImages.delete(row);
  }
  const instructions = promptParts.map((part) => part.text).join("\n\n");
  const contextSnapshot = snapshot({
    parts: promptParts,
    history: sized.slice(history.keepFrom, -1),
    current: sized.at(-1) ?? null,
    images: visibleImages.size,
    window,
    summarized: summaryText ? history.keepFrom : 0,
    pendingSummary: 0,
  });
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
    ...(autoInfo ? { auto: autoInfo } : {}),
    ...(savedMemory ? { memory: savedMemory } : {}),
    ...(documents.notes.length ? { fileNotes: documents.notes } : {}),
    ...(webSources.length ? { web: webSources } : {}),
    ...(searchSources.length ? { searchSources } : {}),
    ...(searchNotice ? { searchNotice } : {}),
    ...(webNotice ? { webNotice } : {}),
    context: contextSnapshot,
  };

  const wantsReasoning =
    deepThink || chosen.skills.includes("reasoning") || chosen.capabilities.some((capability) => capability.id === "reasoning");
  const modelForStream = wantsReasoning
    ? wrapLanguageModel({
        model: chatModel as Parameters<typeof wrapLanguageModel>[0]["model"],
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      })
    : chatModel;

  const result = streamText({
    model: modelForStream,
    instructions,
    messages: modelMessages,
    maxOutputTokens: outputCap(allowance.remaining),
    abortSignal: agent.signal,
    onFinish: (event) => {
      usage = event.totalUsage;
    },
  });

  const thinkingStarted = Date.now();

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        if (searchSources.length) {
          writer.write({ type: "data-sources", data: searchSources });
        }
        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            sendReasoning: true,
            originalMessages: cleanMessages,
            messageMetadata: ({ part }) => {
              if (part.type === "start") return meta;
              if (part.type === "finish") {
                if (part.totalUsage.inputTokens !== undefined) {
                  meta.context = {
                    ...contextSnapshot,
                    reported: { input: part.totalUsage.inputTokens, output: part.totalUsage.outputTokens ?? 0 },
                  };
                }
                return {
                  context: meta.context,
                  ...(meta.searchSources?.length ? { searchSources: meta.searchSources } : {}),
                  ...(meta.thinking ? { thinking: meta.thinking, thinkingMs: meta.thinkingMs } : {}),
                };
              }
              return undefined;
            },
            generateMessageId: () => crypto.randomUUID(),
            onError: (error) => {
              failed = true;
              agent.end();
              noteProviderFailure(chosen.providerId);
              const detail = safeProviderError(chosen.providerId, error);
              console.error("Chat stream failed", chosen.providerId, modelName, detail);
              return chosen.local
                ? `${modelName} stopped responding. Try again, or pick a lighter assistant.`
                : `${chosen.providerName} did not respond. ${detail}`;
            },
            onFinish: async ({ responseMessage, isAborted }) => {
              agent.end();
              const parts = responseMessage.parts.map((part) => ({
                type: part.type,
                text: "text" in part && typeof part.text === "string" ? part.text : undefined,
              }));
              const content = textFromParts(parts);
              const thinking = reasoningFromParts(parts) || undefined;
              const cited = searchSources.length ? markCitedSources(searchSources, content) : searchSources;
              if (cited.length) {
                meta.searchSources = cited;
                writer.write({ type: "data-sources", data: cited });
              }
              if (thinking) {
                meta.thinking = thinking;
                meta.thinkingMs = Date.now() - thinkingStarted;
              }
              try {
                saveAssistantMessage(conversation.id, {
                  id: responseMessage.id || crypto.randomUUID(),
                  content,
                  meta: {
                    model: meta.model,
                    provider: meta.provider,
                    fallbackFrom: meta.fallbackFrom,
                    auto: meta.auto,
                    memory: meta.memory,
                    fileNotes: meta.fileNotes,
                    web: meta.web,
                    searchSources: cited.length ? cited : undefined,
                    searchNotice: meta.searchNotice,
                    webNotice: meta.webNotice,
                    thinking,
                    thinkingMs: thinking ? meta.thinkingMs : undefined,
                    context: meta.context,
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
                  feature: "chat",
                  estimated: usage?.inputTokens === undefined || usage?.outputTokens === undefined,
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
        );
      },
    }),
  });
}
