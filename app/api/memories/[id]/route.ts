import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { deleteMemory, MAX_MEMORY_CHARS, MemoryError, updateMemory } from "@/lib/memory";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({ content: z.string().trim().min(1).max(MAX_MEMORY_CHARS) });

export const PATCH = handler<Context>(async (request, context) => {
  const user = await apiUser(request);
  const { id } = await context.params;
  const { content } = await parseBody(request, schema);
  try {
    if (!updateMemory(user.id, id, content)) throw new ApiError("Memory not found", 404);
  } catch (error) {
    if (error instanceof MemoryError) throw new ApiError(error.message, 400);
    throw error;
  }
  return Response.json({ id, content });
});

export const DELETE = handler<Context>(async (request, context) => {
  const user = await apiUser(request);
  const { id } = await context.params;
  if (!deleteMemory(user.id, id)) throw new ApiError("Memory not found", 404);
  return new Response(null, { status: 204 });
});
