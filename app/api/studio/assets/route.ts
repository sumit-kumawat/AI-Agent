import { z } from "zod";
import { ApiError, apiUser, handler, parseBody } from "@/lib/api";
import { deleteAssetForUser, listAssetsForUser } from "@/lib/creative/assets";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  const url = new URL(request.url);
  const assets = listAssetsForUser(user.id, {
    kind: url.searchParams.get("kind") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? "50"),
  });
  return Response.json({ assets });
});

const deleteSchema = z.object({ id: z.uuid() });

export const DELETE = handler(async (request) => {
  const user = await apiUser(request);
  const body = await parseBody(request, deleteSchema);
  if (!deleteAssetForUser(body.id, user.id)) throw new ApiError("Asset not found.", 404);
  return Response.json({ ok: true });
});
