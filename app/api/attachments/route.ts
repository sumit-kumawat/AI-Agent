import { ApiError, apiUser, handler } from "@/lib/api";
import { FileRejected, saveUpload, storageUsed } from "@/lib/attachments/store";
import { MAX_FILE_BYTES } from "@/lib/attachments/types";
import { capabilityBlock, storageLimit } from "@/lib/plans/entitlements";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** One file per request, so the browser can show progress for each. */
export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const blocked = capabilityBlock(user, "attachments");
  if (blocked) return Response.json({ error: blocked.message, plan: blocked }, { status: 403 });
  const limited = rateLimit(`attachments:upload:${user.id}`, 60, 10 * 60 * 1000, {
    endpoint: "attachments.upload",
    userId: user.id,
  });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) throw new ApiError("That file is too large.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("Upload a file.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("Upload a file.", 400);
  if (file.size === 0) throw new ApiError(`${file.name} is empty.`, 400);
  if (file.size > MAX_FILE_BYTES) throw new ApiError("That file is too large.", 413);

  try {
    const attachment = await saveUpload(
      user.id,
      { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
      storageLimit(user, "attachments"),
    );
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof FileRejected) throw new ApiError(error.message, 422);
    throw error;
  }
});

export const GET = handler(async (request) => {
  const user = await apiUser(request);
  return Response.json({ used: storageUsed(user.id), limit: storageLimit(user, "attachments") });
});
