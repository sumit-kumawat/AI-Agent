import { z } from "zod";
import { apiUser, handler, parseBody } from "@/lib/api";
import { detectEngines, engineConfig, listStoredEngines, saveEngineConfig } from "@/lib/creative/engines";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await apiUser(request);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const engines = refresh ? await detectEngines() : listStoredEngines();
  return Response.json({ engines, config: engineConfig() });
});

const patchSchema = z.object({
  ffmpegPath: z.string().max(500).nullable().optional(),
  comfyuiUrl: z.string().max(500).nullable().optional(),
  rembgPath: z.string().max(500).nullable().optional(),
});

export const PATCH = handler(async (request) => {
  await apiUser(request);
  const body = await parseBody(request, patchSchema);
  const engines = await saveEngineConfig(body);
  return Response.json({ engines, config: engineConfig() });
});
