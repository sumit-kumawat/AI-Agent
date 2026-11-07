import { auth } from "@/lib/auth";
import { findInstalled, getInventory, ollamaRoot } from "@/lib/ollama";
import { rateLimit } from "@/lib/rate-limit";
import { modelNameSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Loads a model into memory ahead of the first message, so the first reply
 * does not pay the cold-start cost. Ollama treats an empty prompt as a load.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`models:warm:${session.user.id}`, 20, 60 * 1000).ok) {
    return new Response(null, { status: 204 });
  }
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = modelNameSchema.safeParse(body?.name);
  if (!name.success) return Response.json({ error: "Invalid model." }, { status: 400 });

  const inventory = await getInventory();
  const model = inventory.ok ? findInstalled(inventory.models, name.data) : undefined;
  if (!model) return Response.json({ error: "Model is not installed." }, { status: 404 });

  void fetch(`${ollamaRoot()}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model.name, keep_alive: "30m" }),
  }).catch(() => undefined);

  return new Response(null, { status: 202 });
}
