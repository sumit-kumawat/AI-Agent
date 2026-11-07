import { auth } from "@/lib/auth";
import {
  deleteConversation,
  getConversationForUser,
  listMessages,
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
