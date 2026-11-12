import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { createWorkflow, deleteWorkflow, listWorkflowsForUser } from "@/lib/creative/schedules";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  return Response.json({ workflows: listWorkflowsForUser(user.id) });
});

const postSchema = z.object({
  name: z.string().min(1).max(120),
  graph: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, postSchema);
  const workflow = createWorkflow({ userId: user.id, name: body.name, graph: body.graph });
  return Response.json({ workflow }, { status: 201 });
});

const deleteSchema = z.object({ id: z.uuid() });

export const DELETE = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, deleteSchema);
  if (!deleteWorkflow(body.id, user.id)) throw new ApiError("Workflow not found.", 404);
  return Response.json({ ok: true });
});
