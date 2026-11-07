import { auth } from "@/lib/auth";
import {
  deleteConversation,
  getConversationForUser,
  listMessages,
  renameConversation,
} from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const conversation = getConversationForUser(id, session.user.id);
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  return Response.json({
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    messages: listMessages(conversation.id).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = (body as { title?: unknown } | null)?.title;
  const title = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!title || title.length > 120) {
    return Response.json({ error: "Title must be 1 to 120 characters." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!renameConversation(id, session.user.id, title)) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  return Response.json({ id, title });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = deleteConversation(id, session.user.id);
  if (!deleted) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
