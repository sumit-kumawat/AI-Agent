import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { setMessageFeedback } from "@/lib/db/queries";

export const runtime = "nodejs";

const schema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.null()]) });

export const PUT = handler<{ params: Promise<{ id: string }> }>(async (request, context) => {
  const user = await apiUser(request);
  const { id } = await context.params;
  const { value } = await parseBody(request, schema);
  if (!setMessageFeedback(id, user.id, value)) throw new ApiError("Message not found", 404);
  return Response.json({ id, feedback: value });
});
