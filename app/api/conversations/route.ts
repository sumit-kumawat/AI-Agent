import { auth } from "@/lib/auth";
import {
  createConversation,
  listConversations,
} from "@/lib/db/queries";
import { findInstalled, getInventory } from "@/lib/ollama";
import { modelNameSchema } from "@/lib/validators";

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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { model?: unknown } | null;
  const requested = modelNameSchema.safeParse(body?.model);
  let model: string | null = null;
  if (requested.success) {
    const inventory = await getInventory();
    model = inventory.ok ? (findInstalled(inventory.models, requested.data)?.name ?? null) : null;
  }
  const conversation = createConversation(session.user.id, model);
  return Response.json(conversation, { status: 201 });
}
