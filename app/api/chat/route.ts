import type { ModelMessage, UIMessage } from "ai";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { auth } from "@/lib/auth";
import {
  getConversationForUser,
  maybeSetTitle,
  saveAssistantMessage,
  setConversationModel,
  syncTranscript,
} from "@/lib/db/queries";
import { findInstalled, getChatModel, getInventory, resolveModel } from "@/lib/ollama";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { textFromParts } from "@/lib/text";
import { chatRequestSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MODEL_CONTEXT_MESSAGES = 40;

const INSTRUCTIONS = `You are Harbor, a local assistant running through Ollama.
Answer clearly and directly. When you write code, keep it complete enough to run.
If you are unsure, say so.`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimit(`chat:${session.user.id}`, 30, 60 * 1000);
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

  const conversation = getConversationForUser(
    parsed.data.conversationId,
    session.user.id,
  );
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

  // Reject a bad model before touching history; an outage below still saves the message.
  const inventory = await getInventory();
  const requested = parsed.data.model;
  if (inventory.ok && requested && !findInstalled(inventory.models, requested)) {
    return Response.json(
      { error: `Model "${requested}" is not installed. Pick another model.` },
      { status: 400 },
    );
  }

  syncTranscript(conversation.id, transcript);
  maybeSetTitle(conversation.id, conversation.title, latestUser.content);

  if (!inventory.ok) {
    return Response.json({ error: inventory.error }, { status: 503 });
  }
  const modelName = resolveModel(inventory.models, requested, conversation.model);
  if (!modelName) {
    return Response.json(
      { error: "No chat models are installed. Ask an admin to add one." },
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

  const modelMessages: ModelMessage[] = transcript
    .slice(-MODEL_CONTEXT_MESSAGES)
    .map((message) => ({ role: message.role, content: message.content }));

  const result = streamText({
    model: getChatModel(modelName),
    instructions: INSTRUCTIONS,
    messages: modelMessages,
    maxOutputTokens: 4096,
    abortSignal: request.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: cleanMessages,
      generateMessageId: () => crypto.randomUUID(),
      onError: (error) => {
        console.error("Ollama stream failed", error);
        return `${modelName} stopped responding. Check that Ollama is running, or pick a smaller model.`;
      },
      onFinish: async ({ responseMessage }) => {
        try {
          const content = textFromParts(
            responseMessage.parts.map((part) => ({
              type: part.type,
              text:
                "text" in part && typeof part.text === "string"
                  ? part.text
                  : undefined,
            })),
          );
          saveAssistantMessage(conversation.id, {
            id: responseMessage.id || crypto.randomUUID(),
            content,
          });
        } catch (error) {
          console.error("Failed to save the assistant reply", error);
        }
      },
    }),
  });
}
