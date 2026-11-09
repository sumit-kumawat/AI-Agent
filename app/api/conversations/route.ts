import { z } from "zod";
import { apiUser, handler, parseBody } from "@/lib/api";
import {
  createConversation,
  listArchivedConversations,
  listConversations,
} from "@/lib/db/queries";
import { AUTO_MODES } from "@/lib/model-ref";
import { modelsForUser } from "@/lib/plans/entitlements";
import { modelNameSchema, providerIdSchema } from "@/lib/validators";

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
  providerId: providerIdSchema.optional(),
  mode: z.enum(AUTO_MODES).optional(),
  temporary: z.boolean().optional(),
});

export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, createSchema);
  let model: string | null = null;
  let providerId: string | null = null;
  if (body.model) {
    const { models } = await modelsForUser(user);
    const wantedProvider = body.providerId ?? "ollama";
    const match = models.find(
      (option) =>
        option.providerId === wantedProvider &&
        (option.modelId === body.model ||
          option.modelId === `${body.model}:latest` ||
          body.model === `${option.modelId}:latest`),
    );
    if (match) {
      model = match.modelId;
      providerId = match.providerId;
    }
  }
  const mode = model ? null : (body.mode ?? null);
  return Response.json(createConversation(user.id, model, body.temporary ?? false, providerId, mode), {
    status: 201,
  });
});
