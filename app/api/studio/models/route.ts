import { apiUser, handler } from "@/lib/api";
import { listCreativeModels } from "@/lib/creative/models";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await apiUser(request);
  return Response.json({ models: listCreativeModels() });
});
