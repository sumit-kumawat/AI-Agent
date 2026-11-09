import { apiUser, handler } from "@/lib/api";
import { contextBudget, documentContext } from "@/lib/attachments/context";
import { conversationAttachments } from "@/lib/attachments/store";
import { IMAGE_TOKENS, planHistory, replyReserve, snapshot, summaryBlock, windowOf } from "@/lib/context/compress";
import type { ContextCategory } from "@/lib/context/types";
import { getConversationForUser, listMessages, recentConversationTitles } from "@/lib/db/queries";
import { relevantMemories } from "@/lib/memory";
import { autoModeOf, parseModelRef } from "@/lib/model-ref";
import { modelsForUser } from "@/lib/plans/entitlements";
import { getPreferences } from "@/lib/preferences";
import { instructionParts } from "@/lib/prompt";
import { linkReadingEnabled } from "@/lib/research/config";
import { webAccessNote } from "@/lib/web/links";
import { preferredModel } from "@/lib/providers/catalog";

export const runtime = "nodejs";

const MAX_IMAGES_IN_CONTEXT = 6;

/**
 * What the next turn would send, built the same way /api/chat builds it, for
 * the context meter. Read-only: it never summarises, it reports how many
 * messages the next send will summarise.
 */
export const GET = handler(async (request) => {
  const user = await apiUser(request);
  const params = new URL(request.url).searchParams;
  const conversationId = params.get("conversationId");
  const conversation = conversationId ? getConversationForUser(conversationId, user.id) : null;
  if (conversationId && !conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const { models } = await modelsForUser(user);
  const selection = params.get("model");
  const ref = autoModeOf(selection) ? null : parseModelRef(selection);
  const model =
    (ref && models.find((option) => option.providerId === ref.providerId && option.modelId === ref.modelId)) ||
    (conversation?.model && models.find((option) => option.modelId === conversation.model)) ||
    preferredModel(models);
  if (!model) return Response.json({ error: "No models are available." }, { status: 503 });

  const prefs = getPreferences(user.id);
  const temporary = conversation?.temporary ?? params.get("temporary") === "1";
  const stored = conversation ? listMessages(conversation.id).filter((row) => row.role === "user" || row.role === "assistant") : [];
  const lastUser = [...stored].reverse().find((row) => row.role === "user")?.content ?? "";
  const remembering = !temporary && prefs.memoryEnabled;
  const parts: { category: ContextCategory; text: string }[] = instructionParts({
    prefs,
    userName: user.name,
    memories: remembering ? relevantMemories(user.id, lastUser) : [],
    recentTitles: !temporary && prefs.referenceHistory ? recentConversationTitles(user.id, conversation?.id ?? "") : [],
    temporary,
  });
  const window = windowOf(model);
  const files = conversation ? conversationAttachments(conversation.id).filter((row) => row.messageId) : [];
  const documents = documentContext(files, lastUser || "Summarize the attached files.", contextBudget(model.local, window.tokens));
  if (documents.text) parts.push({ category: "attachments", text: documents.text });
  parts.push({ category: "system", text: webAccessNote(linkReadingEnabled()) });

  const images = model.vision ? files.filter((row) => row.kind === "image").slice(-MAX_IMAGES_IN_CONTEXT) : [];
  const imageMessages = new Map<string, number>();
  for (const row of images) imageMessages.set(row.messageId!, (imageMessages.get(row.messageId!) ?? 0) + 1);
  const sized = stored.map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    extraTokens: (imageMessages.get(row.id) ?? 0) * IMAGE_TOKENS,
  }));
  const fixed = parts.reduce((sum, part) => sum + Math.ceil(part.text.length / 4), 0);
  const windowTokens = window.tokens ?? 8_192;
  const plan = planHistory({
    conversationId: conversation && !conversation.temporary ? conversation.id : null,
    messages: sized,
    budget: Math.max(1_024, windowTokens - replyReserve(windowTokens) - fixed),
  });
  if (plan.summary) parts.push({ category: "summary", text: summaryBlock(plan.summary) });
  const kept = sized.slice(plan.keepFrom);
  const keptImages = kept.reduce((sum, message) => sum + (imageMessages.get(message.id) ?? 0), 0);

  return Response.json({
    model: { key: model.key, name: model.name },
    context: snapshot({
      parts,
      history: kept,
      current: null,
      images: keptImages,
      window,
      summarized: plan.summary ? plan.keepFrom - plan.pending : 0,
      pendingSummary: plan.pending,
    }),
  });
});
