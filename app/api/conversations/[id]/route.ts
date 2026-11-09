import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { pruneUserFiles } from "@/lib/attachments/store";
import { parseMeta } from "@/lib/chat-types";
import {
  deleteConversation,
  getConversationForUser,
  listMessages,
  renameConversation,
  updateConversationFlags,
} from "@/lib/db/queries";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = handler<Context>(async (request, context) => {
  const user = await apiUser(request);
  const { id } = await context.params;
  const conversation = getConversationForUser(id, user.id);
  if (!conversation) throw new ApiError("Conversation not found", 404);
  return Response.json({
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    pinned: conversation.pinnedAt !== null,
    archived: conversation.archivedAt !== null,
    temporary: conversation.temporary,
    messages: listMessages(conversation.id).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      feedback: message.feedback,
      meta: parseMeta(message.meta),
      createdAt: message.createdAt,
    })),
  });
});

const patchSchema = z
  .object({
    title: z
      .string()
      .transform((value) => value.replace(/\s+/g, " ").trim())
      .pipe(z.string().min(1, "Title must be 1 to 120 characters.").max(120, "Title must be 1 to 120 characters.")),
    pinned: z.boolean(),
    archived: z.boolean(),
  })
  .partial()
  .strict();

export const PATCH = handler<Context>(async (request, context) => {
  const user = await apiUser(request);
  const { id } = await context.params;
  const body = await parseBody(request, patchSchema);
  if (!getConversationForUser(id, user.id)) throw new ApiError("Conversation not found", 404);
  if (body.title !== undefined) renameConversation(id, user.id, body.title);
  if (body.pinned !== undefined || body.archived !== undefined) {
    if (!updateConversationFlags(id, user.id, body)) {
      throw new ApiError("Temporary chats cannot be pinned or archived.", 400);
    }
  }
  const conversation = getConversationForUser(id, user.id)!;
  return Response.json({
    id,
    title: conversation.title,
    pinned: conversation.pinnedAt !== null,
    archived: conversation.archivedAt !== null,
  });
});

export const DELETE = handler<Context>(async (request, context) => {
  const user = await apiUser(request);
  const { id } = await context.params;
  if (!deleteConversation(id, user.id)) throw new ApiError("Conversation not found", 404);
  pruneUserFiles(user.id);
  return new Response(null, { status: 204 });
});
