import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { detectEngines } from "@/lib/creative/engines";
import { cancelJob, enqueueJob, listJobsForUser, retryJob } from "@/lib/creative/queue";
import type { CreativeJobKind, EngineId } from "@/lib/creative/types";

export const runtime = "nodejs";

const KIND_ENGINES: Record<string, EngineId[]> = {
  "image.generate": ["comfyui"],
  "video.generate": ["comfyui", "ffmpeg"],
  "rembg.run": ["rembg"],
  "media.convert": ["ffmpeg"],
  "workflow.run": [],
};

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  return Response.json({ jobs: listJobsForUser(user.id, Number.isFinite(limit) ? limit : 50) });
});

const postSchema = z.object({
  kind: z.enum(["image.generate", "video.generate", "rembg.run", "media.convert", "workflow.run"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, postSchema);
  const required = KIND_ENGINES[body.kind] ?? [];
  if (required.length) {
    const engines = await detectEngines();
    const missing = required.filter((id) => !engines.find((engine) => engine.id === id)?.available);
    if (missing.length) {
      throw new ApiError(
        `Required engine${missing.length > 1 ? "s" : ""} not installed: ${missing.join(", ")}. Configure them in Creative Settings.`,
        400,
      );
    }
  }
  // Phase 1: enqueue is honest about deferred execution for GPU/Comfy kinds.
  const job = enqueueJob({
    userId: user.id,
    kind: body.kind as CreativeJobKind,
    payload: {
      ...(body.payload ?? {}),
      phase: 1,
      note: "Queued for the creative worker. Heavy generation runs only after engines are installed.",
    },
  });
  return Response.json({ job }, { status: 201 });
});

const actionSchema = z.object({
  id: z.uuid(),
  action: z.enum(["cancel", "retry"]),
});

export const PATCH = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, actionSchema);
  const job = body.action === "cancel" ? cancelJob(body.id, user.id) : retryJob(body.id, user.id);
  if (!job) throw new ApiError("Job not found.", 404);
  return Response.json({ job });
});
