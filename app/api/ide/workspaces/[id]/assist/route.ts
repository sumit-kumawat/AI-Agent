import { streamText, type LanguageModelUsage } from "ai";
import { z } from "zod";
import { startSession } from "@/lib/agents";
import { estimateTokens } from "@/lib/context/compress";
import { findUserById, recordUsage } from "@/lib/db/queries";
import { HttpError, errorResponse, ideUser, readJson } from "@/lib/ide/guard";
import { cleanRelative, isSensitive } from "@/lib/ide/paths";
import { openWorkspace } from "@/lib/ide/workspaces";
import { AUTO_MODES, parseModelRef } from "@/lib/model-ref";
import { analyzeTask } from "@/lib/models/router";
import { modelsForUser } from "@/lib/plans/entitlements";
import { checkAllowance } from "@/lib/plans/usage";
import { getPreferences } from "@/lib/preferences";
import { resolveChatTarget } from "@/lib/providers/catalog";
import { costMicro, languageModel, safeProviderError } from "@/lib/providers/engine";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AGENT_ID = "ollama";
const MAX_OUTPUT_TOKENS = 4096;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .min(1)
    .max(20),
  file: z
    .object({ path: z.string().max(500), content: z.string().max(200_000), language: z.string().max(40).optional() })
    .optional(),
  selection: z.string().max(40_000).optional(),
  mode: z.enum(AUTO_MODES).optional(),
  /** A model key (`provider\u001fmodel`); Auto when absent. */
  model: z.string().max(200).optional(),
});

const INSTRUCTIONS = [
  "You are the coding assistant inside a web IDE.",
  "Answer questions about the user's code, explain it, find bugs, and propose changes.",
  "When you change code, show the complete changed section in a fenced code block with the language, and say which file it belongs to.",
  "You cannot run code, open other files, browse the web or change files yourself; the user applies your changes. Say so if asked.",
  "Be concise and precise. Do not invent APIs, files or output you have not seen.",
].join("\n");

/** A coding assistant for the open file, metered against the plan's IDE allowance. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await ideUser(request);
    openWorkspace(actor, (await params).id);
    const limited = rateLimit(`ide:assist:${actor.id}`, 30, 10 * 60 * 1000, { endpoint: "ide.assist", userId: actor.id });
    if (!limited.ok) return tooManyRequests(limited.retryAfter);

    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(parsed.error.issues[0]?.message ?? "Check the request.", 400);
    const body = parsed.data;
    const latest = body.messages.at(-1)!;
    if (latest.role !== "user" || !latest.content.trim()) throw new HttpError("Ask a question first.", 400);

    let fileBlock = "";
    if (body.file) {
      const relative = cleanRelative(body.file.path);
      if (isSensitive(relative)) {
        throw new HttpError(`${relative} looks like a secrets file, so it is never sent to an AI model. Close it or open another file.`, 400);
      }
      const selection = body.selection?.trim()
        ? `\n\nThe user selected this part of it:\n\`\`\`${body.file.language ?? ""}\n${body.selection}\n\`\`\``
        : "";
      fileBlock = `The user has ${relative} open:\n\`\`\`${body.file.language ?? ""}\n${body.file.content}\n\`\`\`${selection}`;
    }

    const user = findUserById(actor.id)!;
    const prefs = getPreferences(user.id);
    const requested = parseModelRef(body.model);
    const mode = requested ? undefined : (body.mode ?? "balance");
    const history = body.messages.reduce((sum, message) => sum + message.content.length, 0);
    const resolved = await resolveChatTarget({
      requestedProvider: requested?.providerId,
      requestedModel: requested?.modelId,
      conversationProvider: null,
      conversationModel: null,
      allowCloud: prefs.cloudModels,
      mode,
      task: mode
        ? analyzeTask({ text: latest.content, images: false, documents: Boolean(fileBlock), historyChars: history + fileBlock.length })
        : undefined,
      catalog: await modelsForUser(user),
    });
    if (!resolved.ok) return Response.json({ error: resolved.error }, { status: resolved.status });
    const chosen = resolved.target.model;

    const allowance = checkAllowance(user, { model: chosen.modelId, feature: "ide" });
    if (!allowance.ok) return Response.json({ error: allowance.block.message, plan: allowance.block }, { status: 429 });

    const agent = startSession(
      { agentId: AGENT_ID, userId: user.id, userEmail: user.email, conversationId: null, model: chosen.modelId },
      request.signal,
    );
    if (!agent.ok) return Response.json({ error: agent.error }, { status: agent.status });

    let model: ReturnType<typeof languageModel>;
    try {
      model = languageModel(chosen.providerId, chosen.modelId);
    } catch (error) {
      agent.end();
      return Response.json({ error: safeProviderError(chosen.providerId, error) }, { status: 503 });
    }

    const instructions = fileBlock ? `${INSTRUCTIONS}\n\n${fileBlock}` : INSTRUCTIONS;
    const startedAt = Date.now();
    let recorded = false;
    const record = (usage: LanguageModelUsage | undefined, text: string, status: "ok" | "error" | "aborted") => {
      if (recorded) return;
      recorded = true;
      agent.end();
      const input = usage?.inputTokens ?? estimateTokens(instructions) + estimateTokens(body.messages.map((m) => m.content).join("\n"));
      const output = usage?.outputTokens ?? estimateTokens(text);
      recordUsage({
        userId: user.id,
        conversationId: null,
        agentId: AGENT_ID,
        model: chosen.modelId,
        providerId: chosen.providerId,
        feature: "ide",
        estimated: usage?.inputTokens === undefined || usage?.outputTokens === undefined,
        inputTokens: input,
        outputTokens: output,
        costMicro: costMicro(chosen.providerId, chosen.modelId, input, output),
        durationMs: Date.now() - startedAt,
        status,
      });
    };

    let streamed = "";
    const result = streamText({
      model,
      instructions,
      messages: body.messages,
      maxOutputTokens:
        allowance.remaining === null ? MAX_OUTPUT_TOKENS : Math.max(256, Math.min(MAX_OUTPUT_TOKENS, allowance.remaining)),
      abortSignal: agent.signal,
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta") streamed += chunk.text;
      },
      onFinish: (event) => record(event.totalUsage, event.text, "ok"),
      onError: () => record(undefined, streamed, "error"),
      onAbort: () => record(undefined, streamed, "aborted"),
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-store",
        "X-Model": encodeURIComponent(chosen.name),
        ...(resolved.target.auto ? { "X-Auto-Reason": encodeURIComponent(resolved.target.auto.reason) } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
