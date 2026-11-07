import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import {
  getInventory,
  getModelName,
  getUserInventory,
  invalidateInventory,
  ollamaRoot,
} from "@/lib/ollama";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { modelNameSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

async function readModelName(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  return modelNameSchema.safeParse(body?.name);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = isAdmin(session.user);
  const inventory = admin ? await getInventory() : await getUserInventory();
  return Response.json(
    {
      ok: inventory.ok,
      error: inventory.ok ? null : inventory.error,
      models: inventory.ok ? inventory.models : [],
      defaultModel: getModelName(),
      admin,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Downloads a model and streams Ollama's NDJSON progress lines back to the browser. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user)) {
    return Response.json({ error: "Only an admin can download models." }, { status: 403 });
  }
  const limited = rateLimit(`models:pull:${session.user.id}`, 20, 60 * 60 * 1000, {
    endpoint: "models.pull",
    userId: session.user.id,
  });
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const name = await readModelName(request);
  if (!name.success) {
    return Response.json({ error: "Enter a model name such as llama3.2:3b." }, { status: 400 });
  }

  audit(
    { id: session.user.id, email: session.user.email ?? "unknown" },
    "model.download",
    { type: "model", id: name.data },
  );

  let upstream: Response;
  try {
    upstream = await fetch(`${ollamaRoot()}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name.data, stream: true }),
      signal: request.signal,
    });
  } catch {
    return Response.json({ error: "Cannot reach Ollama." }, { status: 503 });
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: detail.includes("not found") ? `Model "${name.data}" was not found in the Ollama library.` : "Ollama refused the download." },
      { status: 502 },
    );
  }

  const passthrough = new TransformStream<Uint8Array, Uint8Array>({
    flush() {
      invalidateInventory();
    },
  });
  void upstream.body.pipeTo(passthrough.writable).catch(() => invalidateInventory());

  return new Response(passthrough.readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user)) {
    return Response.json({ error: "Only an admin can remove models." }, { status: 403 });
  }
  const name = await readModelName(request);
  if (!name.success) {
    return Response.json({ error: "Invalid model name." }, { status: 400 });
  }
  try {
    const response = await fetch(`${ollamaRoot()}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name.data }),
    });
    invalidateInventory();
    if (response.ok) {
      audit(
        { id: session.user.id, email: session.user.email ?? "unknown" },
        "model.remove",
        { type: "model", id: name.data },
      );
    }
    if (response.status === 404) {
      return Response.json({ error: "That model is not installed." }, { status: 404 });
    }
    if (!response.ok) {
      return Response.json({ error: "Ollama could not remove the model." }, { status: 502 });
    }
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Cannot reach Ollama." }, { status: 503 });
  }
}
