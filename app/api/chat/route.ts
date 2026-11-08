import type { LanguageModelUsage, ModelMessage, UIMessage } from "ai";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { startSession } from "@/lib/agents";
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
import { findInstalled, getChatModel, getUserInventory, resolveModel } from "@/lib/ollama";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { textFromParts } from "@/lib/text";
import { chatRequestSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

const AGENT_ID = "ollama";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MODEL_CONTEXT_MESSAGES = 40;

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
  const transcript = messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = textFromParts(
      message.parts.map((part) => ({
        type: part.type,
        text:
          "text" in part && typeof part.text === "string" ? part.text : undefined,
      })),
    );
    if (!content.trim()) return [];
    return [{ id: message.id, role: message.role, content }];
  });

  const latestUser = [...transcript].reverse().find((message) => message.role === "user");
  if (!latestUser) {
    return Response.json(
      { error: "Send a message before asking the model to reply." },
      { status: 400 },
    );
  }

  // Everything below that can reject runs before history is touched, so a
  // refused request never rewrites the stored conversation.
  const inventory = await getUserInventory();
  const requested = parsed.data.model;
  if (inventory.ok && requested && !findInstalled(inventory.models, requested)) {
    return Response.json(
      { error: `Model "${requested}" is not available. Pick another model.` },
      { status: 400 },
    );
  }
  const modelName = inventory.ok
    ? resolveModel(inventory.models, requested, conversation.model)
    : null;

  if (findBlockedKeyword(latestUser.content)) {
    recordUsage({
      userId: user.id,
      conversationId: conversation.id,
      agentId: AGENT_ID,
      model: modelName ?? "none",
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
      model: modelName ?? "unknown",
    },
    request.signal,
  );
  if (!agent.ok) {
    return Response.json({ error: agent.error }, { status: agent.status });
  }

  syncTranscript(conversation.id, transcript, { replace: parsed.data.edit === true });
  maybeSetTitle(conversation.id, conversation.title, latestUser.content);

  const prefs = getPreferences(user.id);
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
  const instructions = buildInstructions({
    prefs,
    userName: user.name,
    memories: remembering ? relevantMemories(user.id, latestUser.content) : [],
    recentTitles:
      !conversation.temporary && prefs.referenceHistory
        ? recentConversationTitles(user.id, conversation.id)
        : [],
    temporary: conversation.temporary,
  });

  if (!inventory.ok || !modelName) {
    agent.end();
    return Response.json(
      { error: inventory.ok ? "No chat models are available. Ask an admin to enable one." : inventory.error },
      { status: 503 },
    );
  }
  if (modelName !== conversation.model) {
    setConversationModel(conversation.id, modelName);
  }

  const cleanMessages: UIMessage[] = transcript.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  }));

  const context = transcript.slice(-MODEL_CONTEXT_MESSAGES);
  const modelMessages: ModelMessage[] = context.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const startedAt = Date.now();
  let usage: LanguageModelUsage | undefined;
  let failed = false;
  const meta: ChatMessageMeta = {
    createdAt: startedAt,
    model: modelName,
    ...(savedMemory ? { memory: savedMemory } : {}),
  };

  const result = streamText({
    model: getChatModel(modelName),
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
        console.error("Ollama stream failed", error);
        return `${modelName} stopped responding. Check that Ollama is running, or pick a smaller model.`;
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
            meta: { model: meta.model, memory: meta.memory },
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
            inputTokens: usage?.inputTokens ?? estimateTokens(promptChars),
            outputTokens: usage?.outputTokens ?? estimateTokens(content.length),
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
