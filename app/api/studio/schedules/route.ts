import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { createSchedule, deleteSchedule, listSchedulesForUser } from "@/lib/creative/schedules";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  return Response.json({ schedules: listSchedulesForUser(user.id) });
});

const postSchema = z.object({
  name: z.string().min(1).max(120),
  cron: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, postSchema);
  const schedule = createSchedule({
    userId: user.id,
    name: body.name,
    cron: body.cron,
    enabled: body.enabled,
    payload: body.payload,
  });
  return Response.json({ schedule }, { status: 201 });
});

const deleteSchema = z.object({ id: z.uuid() });

export const DELETE = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, deleteSchema);
  if (!deleteSchedule(body.id, user.id)) throw new ApiError("Schedule not found.", 404);
  return Response.json({ ok: true });
});
