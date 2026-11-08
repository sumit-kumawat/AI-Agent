import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import {
  addMemory,
  clearMemories,
  listMemories,
  MAX_MEMORIES,
  MAX_MEMORY_CHARS,
  MemoryError,
} from "@/lib/memory";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  return Response.json({ memories: listMemories(user.id), limit: MAX_MEMORIES });
});

const createSchema = z.object({ content: z.string().trim().min(1).max(MAX_MEMORY_CHARS) });

export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const { content } = await parseBody(request, createSchema);
  try {
    return Response.json({ memory: addMemory(user.id, content) }, { status: 201 });
  } catch (error) {
    if (error instanceof MemoryError) throw new ApiError(error.message, 400);
    throw error;
  }
});

export const DELETE = handler(async (request) => {
  const user = await apiUser(request);
  return Response.json({ deleted: clearMemories(user.id) });
});
