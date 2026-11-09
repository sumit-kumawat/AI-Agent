import { ApiError, apiUser, handler } from "@/lib/api";
import { deleteAttachment, getAttachment, readAttachmentFile } from "@/lib/attachments/store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Only images are shown inline; everything else downloads, so a file can never run as a page on this site. */
export const GET = handler<Context>(async (request, { params }) => {
  const user = await apiUser(request);
  const { id } = await params;
  const row = getAttachment(id, user.id);
  if (!row) throw new ApiError("Not found.", 404);
  let bytes: Buffer;
  try {
    bytes = readAttachmentFile(row);
  } catch {
    throw new ApiError("This file is no longer stored.", 410);
  }
  const inline = row.kind === "image" && new URL(request.url).searchParams.get("download") !== "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": inline ? row.mime : "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
});

/** Removing a file that was already sent would change what the assistant saw, so only unsent files can be deleted. */
export const DELETE = handler<Context>(async (request, { params }) => {
  const user = await apiUser(request);
  const { id } = await params;
  const row = getAttachment(id, user.id);
  if (!row) throw new ApiError("Not found.", 404);
  if (row.messageId) throw new ApiError("Files that were sent stay with their chat. Delete the chat to remove them.", 409);
  deleteAttachment(id, user.id);
  return new Response(null, { status: 204 });
});
