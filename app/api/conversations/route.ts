import { auth } from "@/lib/auth";
import {
  createConversation,
  listConversations,
} from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({
    conversations: listConversations(session.user.id),
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversation = createConversation(session.user.id);
  return Response.json(conversation, { status: 201 });
}
