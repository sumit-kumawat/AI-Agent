import { z } from "zod";
import { apiUser, handler, parseBody } from "@/lib/api";
import {
  archiveAllConversations,
  deleteAllConversations,
  restoreAllConversations,
} from "@/lib/db/queries";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["archive-all", "restore-all", "delete-all", "delete-archived"]),
});

export const POST = handler(async (request) => {
  const user = await apiUser(request);
  const { action } = await parseBody(request, schema);
  const count =
    action === "archive-all"
      ? archiveAllConversations(user.id)
      : action === "restore-all"
        ? restoreAllConversations(user.id)
        : deleteAllConversations(user.id, action === "delete-all" ? "all" : "archived");
  return Response.json({ count });
});
