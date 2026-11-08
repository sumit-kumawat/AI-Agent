import { z } from "zod";
import { apiUser, handler, parseBody } from "@/lib/api";
import {
  createConversation,
  listArchivedConversations,
  listConversations,
} from "@/lib/db/queries";
import { findInstalled, getUserInventory } from "@/lib/ollama";
import { modelNameSchema } from "@/lib/validators";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  const archived = new URL(request.url).searchParams.get("archived") === "1";
  return Response.json({
    conversations: archived ? listArchivedConversations(user.id) : listConversations(user.id),
  });
});

const createSchema = z.object({
  model: modelNameSchema.optional(),
  temporary: z.boolean().optional(),
});

export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, createSchema);
  let model: string | null = null;
  if (body.model) {
    const inventory = await getUserInventory();
    model = inventory.ok ? (findInstalled(inventory.models, body.model)?.name ?? null) : null;
  }
  return Response.json(createConversation(user.id, model, body.temporary ?? false), {
    status: 201,
  });
});
